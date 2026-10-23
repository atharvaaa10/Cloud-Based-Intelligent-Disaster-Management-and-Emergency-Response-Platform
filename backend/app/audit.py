"""
Application audit logging service.
Records administrative and operational actions to the audit_log table.
Zero secrets/passwords/tokens policy is strictly enforced.
"""

import logging
from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

logger = logging.getLogger(__name__)

# Keys strictly scrubbed from audit details
SENSITIVE_KEYS = {
    "password",
    "token",
    "secret",
    "authorization",
    "jwt",
    "access_token",
    "internal_token",
}


def sanitize_details(data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Recursively redacts any sensitive keys from audit log details."""
    if not data or not isinstance(data, dict):
        return data

    sanitized = {}
    for k, v in data.items():
        if any(sensitive in k.lower() for sensitive in SENSITIVE_KEYS):
            sanitized[k] = "[REDACTED]"
        elif isinstance(v, dict):
            sanitized[k] = sanitize_details(v)
        else:
            sanitized[k] = v
    return sanitized


async def record_audit_event(
    db: AsyncSession,
    action: str,
    actor_id: Optional[int] = None,
    actor_role: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[int] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> Optional[AuditLog]:
    """
    Persists an audit log entry within the current transaction.
    Non-blocking on unexpected errors: logs warning rather than breaking caller flow.
    """
    try:
        clean_details = sanitize_details(details)
        entry = AuditLog(
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=clean_details,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
        return entry
    except Exception as e:
        logger.warning(
            "Failed to record audit event %s for entity %s/%s: %s",
            action,
            entity_type,
            entity_id,
            e,
        )
        return None
