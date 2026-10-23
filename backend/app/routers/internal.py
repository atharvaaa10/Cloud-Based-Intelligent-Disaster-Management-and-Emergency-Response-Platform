"""
Internal service routes — protected by shared secret header (X-Internal-Token).
Exclusively consumed by internal microservices / AWS Lambda functions outside the VPC.
"""

from datetime import datetime, timezone
import hmac
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import record_audit_event
from app.config import get_settings
from app.database import get_db
from app.models import Incident, PriorityEnum, StatusHistory, _utcnow
from app.schemas import IncidentOut, IncidentTriageRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["Internal Service"])


def verify_internal_token(
    x_internal_token: Optional[str] = Header(None, alias="X-Internal-Token"),
) -> str:
    """
    Validates the shared secret header using a constant-time comparison
    to prevent timing attacks.
    """
    settings = get_settings()
    expected = settings.INTERNAL_TOKEN

    if not x_internal_token or not expected:
        logger.warning("[AUTH] Missing X-Internal-Token header or unconfigured internal secret")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or unconfigured X-Internal-Token header",
        )

    # Constant-time comparison
    if not hmac.compare_digest(x_internal_token.strip(), expected.strip()):
        logger.warning("[AUTH] Invalid X-Internal-Token provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid X-Internal-Token",
        )

    return x_internal_token


@router.post(
    "/incidents/{incident_id}/triage",
    response_model=IncidentOut,
    dependencies=[Depends(verify_internal_token)],
)
async def apply_incident_triage(
    incident_id: int,
    body: IncidentTriageRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Protected endpoint called by the Lambda triage consumer.
    Updates incident priority (if at default), records triage score and reason,
    and appends an audit note in status_history. Idempotent across retries.
    """
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail=f"Incident #{incident_id} not found")

    # 1. Idempotency check: if already triaged with the same score, return without duplicate notes
    if (
        incident.auto_triaged_at is not None
        and incident.triage_score == body.score
        and incident.triage_reason == body.triage_reason
    ):
        logger.info("[TRIAGE] Incident #%d already triaged with score=%d (idempotent no-op)", incident_id, body.score)
        return incident

    # 2. Check if priority is still at default (medium) and not manually assigned by an admin
    priority_changed = False
    if incident.priority == PriorityEnum.medium and incident.auto_triaged_at is None:
        try:
            target_priority = PriorityEnum(body.priority.lower())
            if incident.priority != target_priority:
                incident.priority = target_priority
                priority_changed = True
        except ValueError:
            logger.warning("[TRIAGE] Unknown priority '%s' suggested; retaining default", body.priority)

    # 3. Update triage metadata
    incident.triage_score = body.score
    incident.triage_reason = body.triage_reason
    incident.auto_triaged_at = _utcnow()

    # 4. Record audit note in StatusHistory
    note_msg = (
        f"Auto-triaged by system: {body.triage_reason}"
        if priority_changed or incident.auto_triaged_at is None
        else f"Auto-triaged by system (priority maintained at {incident.priority.value}): {body.triage_reason}"
    )

    history_entry = StatusHistory(
        incident_id=incident.id,
        old_status=incident.status.value,
        new_status=incident.status.value,
        changed_by=incident.reporter_id,
        note=note_msg,
    )
    db.add(history_entry)

    client_ip = request.client.host if request.client else None
    await record_audit_event(
        db,
        action="incident.auto_triaged",
        actor_id=None,
        actor_role="system",
        entity_type="incident",
        entity_id=incident.id,
        details={
            "score": body.score,
            "priority": body.priority,
            "reason": body.triage_reason,
            "priority_changed": priority_changed,
        },
        ip_address=client_ip,
    )

    await db.commit()
    await db.refresh(incident)

    logger.info(
        "[TRIAGE] Incident #%d triaged: score=%d, priority=%s",
        incident.id,
        incident.triage_score,
        incident.priority.value,
    )
    return incident
