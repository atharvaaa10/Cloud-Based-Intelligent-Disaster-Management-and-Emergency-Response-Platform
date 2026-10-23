"""
AWS Lambda function: Disaster Incident Auto-Triage Consumer.
Triggered by Amazon SQS (batch size 5, ReportBatchItemFailures).

Flow:
  SQS message -> Parse & validate -> Compute triage score & priority ->
  HTTP POST to backend /internal/incidents/{id}/triage (protected by X-Internal-Token) ->
  Publish alert notification to Amazon SNS.
"""

from datetime import datetime, timezone
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Local import of shared deterministic triage scoring
try:
    from triage import triage_incident
except ImportError:
    # If running from repository root during tests
    from app.triage import triage_incident

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Cached token in module scope to prevent repetitive Secrets Manager API calls
CACHED_INTERNAL_TOKEN = None


def get_internal_token() -> str:
    """
    Retrieves the shared secret token from environment or AWS Secrets Manager.
    Caches the token in memory across warm Lambda container invocations.
    """
    global CACHED_INTERNAL_TOKEN
    if CACHED_INTERNAL_TOKEN:
        return CACHED_INTERNAL_TOKEN

    # 1. Check direct environment variable (used for local testing and overrides)
    direct_token = os.environ.get("INTERNAL_TOKEN")
    if direct_token:
        CACHED_INTERNAL_TOKEN = direct_token
        return direct_token

    # 2. Check AWS SSM Parameter Store SecureString
    param_name = os.environ.get("INTERNAL_TOKEN_PARAM_NAME", "/disaster-platform/internal-token")
    if param_name:
        try:
            import boto3
            region = os.environ.get("AWS_REGION", "ap-south-1")
            client = boto3.client("ssm", region_name=region)
            resp = client.get_parameter(Name=param_name, WithDecryption=True)
            token = resp.get("Parameter", {}).get("Value", "")
            if token:
                CACHED_INTERNAL_TOKEN = token.strip()
                return CACHED_INTERNAL_TOKEN
        except Exception as e:
            logger.error(json.dumps({"action": "fetch_ssm_parameter_error", "error": str(e), "param": param_name}))

    # 3. Fallback to dev default (warns in logs)
    return "dev-internal-triage-token-change-in-prod"


def log_structured(level: str, action: str, incident_id: int | None = None, **kwargs) -> None:
    """Emits structured JSON logs to CloudWatch with incident_id in every line."""
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level.upper(),
        "action": action,
        "incident_id": incident_id,
        **kwargs,
    }
    msg = json.dumps(log_entry)
    if level.upper() == "ERROR":
        logger.error(msg)
    elif level.upper() == "WARNING":
        logger.warning(msg)
    else:
        logger.info(msg)


def send_triage_to_api(api_base_url: str, incident_id: int, triage_result: dict, token: str) -> dict:
    """
    Calls the backend internal API endpoint with short timeout and 2 retries.
    Uses standard library urllib (zero external pip dependencies).
    """
    endpoint = f"{api_base_url.rstrip('/')}/internal/incidents/{incident_id}/triage"
    payload = json.dumps({
        "priority": triage_result["priority"],
        "triage_reason": triage_result["reason"],
        "score": triage_result["score"],
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": token,
        "User-Agent": "DisasterResponse-Lambda-Triage/1.0",
    }

    max_retries = 2
    last_error = None

    for attempt in range(max_retries + 1):
        try:
            req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                status_code = resp.getcode()
                response_body = resp.read().decode("utf-8")
                if 200 <= status_code < 300:
                    return json.loads(response_body)
                raise RuntimeError(f"HTTP {status_code}: {response_body}")
        except urllib.error.HTTPError as e:
            error_msg = e.read().decode("utf-8", errors="ignore")
            last_error = f"HTTP {e.code}: {error_msg}"
            log_structured(
                "WARNING",
                "api_request_failed",
                incident_id=incident_id,
                attempt=attempt + 1,
                error=last_error,
            )
            # Do not retry on client errors 4xx (except 429 rate limit)
            if 400 <= e.code < 500 and e.code != 429:
                raise RuntimeError(last_error) from e
        except Exception as e:
            last_error = str(e)
            log_structured(
                "WARNING",
                "api_request_exception",
                incident_id=incident_id,
                attempt=attempt + 1,
                error=last_error,
            )

        if attempt < max_retries:
            time.sleep(0.5 * (attempt + 1))

    raise RuntimeError(f"Failed to apply triage to API after {max_retries + 1} attempts: {last_error}")


def publish_sns_alert(sns_topic_arn: str, incident: dict, triage: dict, region: str) -> None:
    """
    Publishes a triage alert to the Amazon SNS topic.
    Critical priority incidents receive a distinctive subject line prefix.
    """
    if not sns_topic_arn:
        log_structured("INFO", "sns_publish_skipped", incident_id=incident.get("incident_id"), reason="No SNS_TOPIC_ARN configured")
        return

    import boto3
    sns = boto3.client("sns", region_name=region)

    incident_id = incident.get("incident_id")
    category = incident.get("category", "other").upper()
    priority = triage["priority"].upper()
    location = incident.get("location_text", "Unknown location")
    affected = incident.get("people_affected", 1)

    # Distinct subject line for critical incidents
    if priority == "CRITICAL":
        subject = f"[CRITICAL EMERGENCY ALERT] #{incident_id} [{category}] at {location}"[:100]
    else:
        subject = f"[Disaster Alert] Incident #{incident_id} [{priority}] - {category}"[:100]

    body = (
        f"🚨 EMERGENCY INCIDENT TRIAGE ALERT\n"
        f"====================================\n"
        f"Incident ID   : #{incident_id}\n"
        f"Priority      : {priority} (Score: {triage['score']}/100)\n"
        f"Category      : {category}\n"
        f"Location      : {location}\n"
        f"People At Risk: {affected}\n"
        f"Triage Reason : {triage['reason']}\n"
        f"Reported At   : {incident.get('created_at', 'N/A')}\n"
        f"Triaged At    : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        f"Please check the administrative dashboard to assign emergency teams."
    )

    sns.publish(
        TopicArn=sns_topic_arn,
        Subject=subject,
        Message=body,
    )
    log_structured(
        "INFO",
        "sns_alert_published",
        incident_id=incident_id,
        priority=priority,
        topic=sns_topic_arn,
    )


def process_record(record: dict) -> None:
    """Processes a single SQS message record."""
    body_str = record.get("body", "{}")
    try:
        data = json.loads(body_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Malformed JSON in SQS message: {e}") from e

    event_type = data.get("event")
    if event_type != "incident.created":
        log_structured("WARNING", "ignored_unknown_event", event_type=event_type)
        return

    incident_id = data.get("incident_id")
    if not incident_id:
        raise ValueError("Missing 'incident_id' in SQS record payload")

    log_structured("INFO", "triage_processing_started", incident_id=incident_id)

    # 1. Compute deterministic triage score
    category = data.get("category", "other")
    people_affected = data.get("people_affected", 1)
    description = data.get("description", "")
    triage_result = triage_incident(category, people_affected, description)

    log_structured(
        "INFO",
        "triage_calculated",
        incident_id=incident_id,
        priority=triage_result["priority"],
        score=triage_result["score"],
        signals=triage_result["breakdown"]["matched_keywords"],
    )

    # 2. HTTP POST to internal backend API
    api_base_url = os.environ.get("API_BASE_URL", "http://localhost:8000")
    token = get_internal_token()
    send_triage_to_api(api_base_url, incident_id, triage_result, token)

    log_structured("INFO", "api_triage_applied", incident_id=incident_id)

    # 3. Publish SNS notification
    sns_topic_arn = os.environ.get("SNS_TOPIC_ARN", "")
    region = os.environ.get("AWS_REGION", "ap-south-1")
    publish_sns_alert(sns_topic_arn, data, triage_result, region)


def handler(event, context):
    """
    AWS Lambda entry point with SQS Partial Batch Response support.
    Returns: {"batchItemFailures": [{"itemIdentifier": message_id}, ...]}
    """
    records = event.get("Records", [])
    batch_item_failures = []

    log_structured("INFO", "batch_received", record_count=len(records))

    for record in records:
        message_id = record.get("messageId", "unknown")
        try:
            process_record(record)
            log_structured("INFO", "record_processed_successfully", message_id=message_id)
        except Exception as e:
            log_structured("ERROR", "record_processing_failed", message_id=message_id, error=str(e))
            batch_item_failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": batch_item_failures}
