"""
NotificationService — creates in-app notifications on incident lifecycle events.

All notification creation is centralized here so that a future SNS publish step
can be added in one place without touching the router or the incident logic.

Usage:
    from app.services.notification_service import NotificationService
    svc = NotificationService(db)
    await svc.notify_status_change(incident, old_status, new_status, changed_by_id)

Future SNS hook:
    After the DB insert in each method, call:
        await sns_client.publish(...)
    The abstraction is already isolated here — callers do not need to change.
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import Incident, Notification, User

logger = logging.getLogger(__name__)

# ── Human-readable labels ─────────────────────────────────────────────────────

STATUS_LABELS = {
    "reported":     "Reported",
    "under_review": "Under Review",
    "assigned":     "Team Assigned",
    "in_progress":  "In Progress",
    "resolved":     "Resolved",
    "cancelled":    "Cancelled",
}

STATUS_MESSAGES = {
    "under_review": (
        "Your emergency report ({code}) is now under review by our operations team. "
        "We are assessing the situation and will update you shortly."
    ),
    "assigned": (
        "A response team has been assigned to your emergency report ({code}). "
        "Help is on the way. {extra}"
    ),
    "in_progress": (
        "Response operations for your emergency report ({code}) are now in progress. "
        "The assigned team is actively working at the location."
    ),
    "resolved": (
        "Your emergency report ({code}) has been marked as resolved. "
        "Thank you for using our platform to keep the community safe."
    ),
    "cancelled": (
        "Your emergency report ({code}) has been cancelled. "
        "If this was a mistake, you may submit a new report."
    ),
}

NOTIFICATION_TYPES = {
    "under_review": "status_update",
    "assigned":     "team_assigned",
    "in_progress":  "status_update",
    "resolved":     "resolved",
    "cancelled":    "cancelled",
}


class NotificationService:
    """
    Centralised in-app notification creator for the incident lifecycle.

    This service is intentionally kept DB-only so it is fast to unit-test.
    A future SNS publish call should be appended AFTER the db.commit() that
    the caller performs — not inside this service — so that network failures
    cannot roll back the DB write.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def notify_status_change(
        self,
        incident: Incident,
        old_status: str,
        new_status: str,
        changed_by_id: int | None = None,
        extra_message: str = "",
    ) -> Notification | None:
        """
        Create a notification for the incident reporter when the status changes.

        Only sends notifications for transitions that matter to the citizen
        (under_review, assigned, in_progress, resolved, cancelled).
        Returns the created Notification or None if no notification was needed.

        SNS hook point: after the caller commits, publish to SNS topic.
        """
        # Only notify for meaningful transitions
        if new_status not in STATUS_MESSAGES:
            return None

        # Only notify if there is a reporter
        reporter_id = incident.reporter_id
        if reporter_id is None:
            return None

        code = incident.public_code or f"INC-{incident.id}"
        extra = f"({extra_message})" if extra_message else ""
        message = STATUS_MESSAGES[new_status].format(code=code, extra=extra).strip()
        title = f"Update on {code}: {STATUS_LABELS.get(new_status, new_status)}"
        notif_type = NOTIFICATION_TYPES.get(new_status, "status_update")

        notification = Notification(
            user_id=reporter_id,
            incident_id=incident.id,
            type=notif_type,
            title=title,
            message=message,
        )
        self.db.add(notification)

        # ── Future SNS hook ──────────────────────────────────────────────────
        # await sns_publish(topic_arn=..., subject=title, message=message)
        # ────────────────────────────────────────────────────────────────────

        logger.info(
            "[NotificationService] Created %s notification for user=%s incident=%s (%s→%s)",
            notif_type, reporter_id, incident.id, old_status, new_status,
        )
        return notification
