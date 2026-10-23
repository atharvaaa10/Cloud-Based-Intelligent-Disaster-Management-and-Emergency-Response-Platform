"""
AWS service stubs — replace these with real boto3 calls when deploying.

Each function clearly marks the integration point so you can swap
in S3 / SQS / SNS / Lambda with minimal changes.
"""

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ── S3: Photo / document upload ──────────────────────────────

async def upload_file_to_s3(file_bytes: bytes, key: str, content_type: str = "image/jpeg") -> str:
    """
    STUB: Upload a file to S3 and return the object key.

    AWS integration:
        import boto3
        s3 = boto3.client("s3", region_name=settings.AWS_REGION)
        s3.put_object(Bucket=settings.S3_BUCKET_NAME, Key=key, Body=file_bytes, ContentType=content_type)
        return key
    """
    logger.info("[S3 STUB] Would upload %d bytes to s3://%s/%s", len(file_bytes), settings.S3_BUCKET_NAME, key)
    return key


async def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """
    STUB: Generate a pre-signed URL for downloading a file.

    AWS integration:
        s3 = boto3.client("s3", region_name=settings.AWS_REGION)
        return s3.generate_presigned_url("get_object", Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key}, ExpiresIn=expires_in)
    """
    logger.info("[S3 STUB] Would generate pre-signed URL for key=%s", key)
    return f"https://{settings.S3_BUCKET_NAME}.s3.amazonaws.com/{key}"


# ── SQS: Async task queue ────────────────────────────────────

async def enqueue_incident_processing(incident_id: int) -> None:
    """
    STUB: Push an incident onto SQS for background processing
    (e.g., AI triage, geocoding, notification fan-out).

    AWS integration:
        sqs = boto3.client("sqs", region_name=settings.AWS_REGION)
        sqs.send_message(QueueUrl=settings.SQS_QUEUE_URL, MessageBody=json.dumps({"incident_id": incident_id}))
    """
    logger.info("[SQS STUB] Would enqueue incident %d for background processing", incident_id)


# ── SNS: Push notifications ──────────────────────────────────

async def notify_status_change(incident_id: int, new_status: str, message: str = "") -> None:
    """
    STUB: Publish an SNS notification when an incident's status changes.

    AWS integration:
        sns = boto3.client("sns", region_name=settings.AWS_REGION)
        sns.publish(
            TopicArn=settings.SNS_TOPIC_ARN,
            Subject=f"Incident {incident_id} → {new_status}",
            Message=message or f"Incident {incident_id} status changed to {new_status}",
        )
    """
    logger.info("[SNS STUB] Would publish status change: incident=%d status=%s", incident_id, new_status)


# ── Lambda: Serverless processing ────────────────────────────

async def invoke_triage_lambda(incident_id: int, description: str) -> dict:
    """
    STUB: Invoke a Lambda function for AI-based incident triage.

    AWS integration:
        lambda_client = boto3.client("lambda", region_name=settings.AWS_REGION)
        response = lambda_client.invoke(
            FunctionName="disaster-triage",
            InvocationType="RequestResponse",
            Payload=json.dumps({"incident_id": incident_id, "description": description}),
        )
        return json.loads(response["Payload"].read())
    """
    logger.info("[LAMBDA STUB] Would invoke triage for incident %d", incident_id)
    return {"suggested_priority": "medium", "suggested_category": "other"}
