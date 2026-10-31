"""
AWS service integrations and stubs.

- S3: Full boto3 implementation when USE_AWS=True (EC2 IAM role/default credential chain).
      Falls back to mock URLs and logging stubs when USE_AWS=False for local dev and tests.
- SQS/SNS/Lambda: Stubs that log actions, reserved for Phase 3.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

ALLOWED_PHOTO_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def get_s3_client():
    """
    Returns boto3 S3 client using the default AWS credential chain
    (Environment variables, EC2 instance profile, or IAM role).
    No credentials are ever hard-coded.
    """
    current_settings = get_settings()
    return boto3.client("s3", region_name=current_settings.AWS_REGION)


# ── S3: Photo upload & download URLs ─────────────────────────

def generate_presigned_upload_url(
    incident_id: int,
    content_type: str,
    file_ext: str | None = None,
    expires_in: int = 300,
) -> dict:
    """
    Generates a presigned S3 PUT URL for uploading incident emergency photos.
    Key format: incidents/{incident_id}/{uuid}.{ext}
    Restricted to image/jpeg, image/png, image/webp.
    Expiry: default 5 minutes (300 seconds).
    """
    current_settings = get_settings()
    if content_type not in ALLOWED_PHOTO_CONTENT_TYPES:
        raise ValueError(
            f"Unsupported content type '{content_type}'. Allowed types: {', '.join(ALLOWED_PHOTO_CONTENT_TYPES.keys())}"
        )

    ext = file_ext.lstrip(".") if file_ext else ALLOWED_PHOTO_CONTENT_TYPES[content_type]
    key = f"incidents/{incident_id}/{uuid.uuid4().hex}.{ext}"

    if current_settings.USE_AWS:
        bucket = current_settings.S3_BUCKET_NAME or "disaster-response-photos"
        try:
            s3 = get_s3_client()
            url = s3.generate_presigned_url(
                ClientMethod="put_object",
                Params={
                    "Bucket": bucket,
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=expires_in,
            )
            logger.info("[S3] Generated presigned upload URL for s3://%s/%s", bucket, key)
            return {"upload_url": url, "photo_key": key, "expires_in": expires_in, "max_bytes": 5 * 1024 * 1024}
        except ClientError as e:
            logger.error("[S3] Failed to generate presigned upload URL: %s", e)
            raise
    else:
        mock_bucket = current_settings.S3_BUCKET_NAME or "local-mock-bucket"
        mock_url = f"https://{mock_bucket}.s3.{current_settings.AWS_REGION}.amazonaws.com/{key}?stub_upload=true"
        logger.info("[S3 STUB] USE_AWS=false: Mock upload URL generated for key=%s", key)
        return {"upload_url": mock_url, "photo_key": key, "expires_in": expires_in, "max_bytes": 5 * 1024 * 1024}


def generate_presigned_download_url(key: str, expires_in: int = 300) -> str:
    """
    Generates a presigned S3 GET URL for viewing an incident photo.
    Expiry: default 5 minutes (300 seconds).
    """
    current_settings = get_settings()
    if current_settings.USE_AWS:
        bucket = current_settings.S3_BUCKET_NAME or "disaster-response-photos"
        try:
            s3 = get_s3_client()
            url = s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=expires_in,
            )
            logger.info("[S3] Generated presigned download URL for s3://%s/%s", bucket, key)
            return url
        except ClientError as e:
            logger.error("[S3] Failed to generate presigned download URL: %s", e)
            raise
    else:
        mock_bucket = current_settings.S3_BUCKET_NAME or "local-mock-bucket"
        mock_url = f"https://{mock_bucket}.s3.{current_settings.AWS_REGION}.amazonaws.com/{key}?stub_download=true"
        logger.info("[S3 STUB] USE_AWS=false: Mock download URL generated for key=%s", key)
        return mock_url


async def upload_file_to_s3(file_bytes: bytes, key: str, content_type: str = "image/jpeg") -> str:
    """
    Direct upload helper (or fallback stub).
    """
    current_settings = get_settings()
    if current_settings.USE_AWS:
        s3 = get_s3_client()
        s3.put_object(
            Bucket=current_settings.S3_BUCKET_NAME,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
        )
        logger.info("[S3] Uploaded %d bytes to s3://%s/%s", len(file_bytes), current_settings.S3_BUCKET_NAME, key)
    else:
        logger.info("[S3 STUB] Would upload %d bytes to s3://%s/%s", len(file_bytes), current_settings.S3_BUCKET_NAME, key)
    return key


async def get_presigned_url(key: str, expires_in: int = 300) -> str:
    """Legacy helper alias."""
    return generate_presigned_download_url(key, expires_in)


def get_sqs_client():
    """Returns boto3 SQS client using default AWS credential chain."""
    current_settings = get_settings()
    return boto3.client("sqs", region_name=current_settings.AWS_REGION)


def get_sns_client():
    """Returns boto3 SNS client using default AWS credential chain."""
    current_settings = get_settings()
    return boto3.client("sns", region_name=current_settings.AWS_REGION)


# ── SQS: Async event-driven processing ────────────────────────

async def enqueue_incident_processing(
    incident_id: int,
    category: str = "other",
    people_affected: int = 1,
    description: str = "",
    location_text: str = "",
    created_at: str | None = None,
) -> bool:
    """
    Sends an SQS message to trigger decoupled, asynchronous auto-triage and dispatch.
    Message format:
      {
        "event": "incident.created",
        "incident_id": incident_id,
        "category": category,
        "people_affected": people_affected,
        "description": description,
        "location_text": location_text,
        "created_at": created_at
      }
    Non-blocking failure: If SQS fails or queue is unreachable, logs error
    and returns False; never raises an exception that breaks submission.
    """
    current_settings = get_settings()
    payload = {
        "event": "incident.created",
        "incident_id": incident_id,
        "category": category,
        "people_affected": people_affected,
        "description": description,
        "location_text": location_text,
        "created_at": created_at or datetime.now(timezone.utc).isoformat(),
    }

    if current_settings.USE_AWS and current_settings.SQS_QUEUE_URL:
        try:
            sqs = get_sqs_client()
            resp = sqs.send_message(
                QueueUrl=current_settings.SQS_QUEUE_URL,
                MessageBody=json.dumps(payload),
            )
            logger.info(
                "[SQS] Enqueued incident %d to %s (MessageId: %s)",
                incident_id,
                current_settings.SQS_QUEUE_URL,
                resp.get("MessageId"),
            )
            return True
        except ClientError as e:
            logger.error(
                "[SQS ERROR] Failed to send incident %d to queue %s: %s",
                incident_id,
                current_settings.SQS_QUEUE_URL,
                e,
            )
            return False
        except Exception as e:
            logger.error("[SQS UNEXPECTED ERROR] Failed to send message: %s", e)
            return False
    else:
        logger.info(
            "[SQS STUB] USE_AWS=false: Enqueued incident %d message: %s",
            incident_id,
            json.dumps(payload),
        )
        return True


# ── SNS: Push notifications and alerts ────────────────────────

async def publish_disaster_alert(
    subject: str,
    message: str,
    attributes: dict | None = None,
) -> bool:
    """
    Publishes an alert notification to the Amazon SNS topic.
    Subscribed admins and CloudWatch alarms receive updates.
    """
    current_settings = get_settings()
    # AWS SNS subjects are limited to 100 ASCII characters
    truncated_subject = subject[:100]

    if current_settings.USE_AWS and current_settings.SNS_TOPIC_ARN:
        try:
            sns = get_sns_client()
            resp = sns.publish(
                TopicArn=current_settings.SNS_TOPIC_ARN,
                Subject=truncated_subject,
                Message=message,
            )
            logger.info(
                "[SNS] Published alert '%s' to %s (MessageId: %s)",
                truncated_subject,
                current_settings.SNS_TOPIC_ARN,
                resp.get("MessageId"),
            )
            return True
        except ClientError as e:
            logger.error(
                "[SNS ERROR] Failed to publish to topic %s: %s",
                current_settings.SNS_TOPIC_ARN,
                e,
            )
            return False
        except Exception as e:
            logger.error("[SNS UNEXPECTED ERROR] Failed to publish alert: %s", e)
            return False
    else:
        logger.info(
            "[SNS STUB] USE_AWS=false: Would publish to %s | Subject: %s | Message: %s",
            current_settings.SNS_TOPIC_ARN or "local-disaster-alerts-topic",
            truncated_subject,
            message,
        )
        return True


async def notify_status_change(
    incident_id: int,
    new_status: str,
    message: str = "",
    category: str = "other",
    priority: str = "medium",
    team_name: str | None = None,
) -> None:
    """
    Publishes an SNS notification when an incident's status or assignment changes.
    Subject and message clearly describe incident ID, category, priority, status, and team.
    """
    subject = f"[Disaster Platform] Incident #{incident_id} [{category.upper()}]: Status -> {new_status.upper()}"
    body = (
        f"Incident Update Notification\n"
        f"----------------------------\n"
        f"Incident ID : #{incident_id}\n"
        f"Category    : {category}\n"
        f"Priority    : {priority}\n"
        f"New Status  : {new_status}\n"
        f"Assignment  : {team_name or 'Unassigned'}\n"
        f"Notes       : {message or 'None provided'}\n"
        f"Updated At  : {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
    )
    await publish_disaster_alert(subject=subject, message=body)


# ── Lambda: Serverless processing helper ─────────────────────

async def invoke_triage_lambda(incident_id: int, description: str) -> dict:
    """
    Helper stub for direct Lambda invocation if invoked synchronously.
    Phase 3 event-driven architecture processes via SQS -> Lambda -> Internal API.
    """
    logger.info("[LAMBDA STUB] Direct invoke triage for incident %d", incident_id)
    return {"suggested_priority": "medium", "suggested_category": "other"}
