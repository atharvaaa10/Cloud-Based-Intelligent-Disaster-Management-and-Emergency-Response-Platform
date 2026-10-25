"""
Unit and integration tests for Phase 3:
- Pure rule-based triage scoring logic & edge cases
- Internal service endpoint (/internal/incidents/{id}/triage) & token authentication
- SQS async queue enqueue and failure tolerance
- SNS emergency alert publishing
- AWS Lambda consumer handler & partial batch failure reporting (moto/mocks)
"""

import json
from unittest.mock import patch, MagicMock
import pytest
from httpx import AsyncClient
from moto import mock_aws
import boto3

from app.config import get_settings
from app.models import Incident, PriorityEnum, RoleEnum, StatusEnum, User
from app.triage import (
    triage_incident,
    calculate_people_score,
    extract_keyword_signals,
    map_score_to_priority,
)
from app.aws_services import (
    enqueue_incident_processing,
    publish_disaster_alert,
    notify_status_change,
)
from tests.conftest import async_session_test
from tests.test_api import auth_header, register_and_login, create_user_with_role

# Import Lambda handler directly from lambda folder
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "lambda"))
import lambda_function

pytestmark = pytest.mark.asyncio


# ── 1. Pure Triage Scoring Logic Tests ───────────────────────

async def test_triage_critical_priority_band():
    """Rescue emergency with high population and critical keyword signals."""
    res = triage_incident(
        category="rescue",
        people_affected=12,
        description="Elderly residents trapped on roof due to severe drowning hazard and flash flooding",
    )
    assert res["priority"] == "critical"
    assert res["score"] >= 75
    assert "rescue" in res["reason"]
    assert "trapped" in res["breakdown"]["matched_keywords"]
    assert "elderly" in res["breakdown"]["matched_keywords"]


async def test_triage_high_priority_band():
    """Medical emergency with moderate population."""
    res = triage_incident(
        category="medical",
        people_affected=4,
        description="Patient in deep distress, ambulance route blocked by water",
    )
    assert res["priority"] == "high"
    assert 50 <= res["score"] < 75


async def test_triage_medium_priority_band():
    """Shelter need with moderate population but no immediate life-threat keywords."""
    res = triage_incident(
        category="shelter",
        people_affected=5,
        description="Roof leaking, need plastic sheets for shelter",
    )
    assert res["priority"] == "medium"
    assert 25 <= res["score"] < 50


async def test_triage_low_priority_band():
    """General resource request for 1 person without urgent signals."""
    res = triage_incident(
        category="food_water",
        people_affected=1,
        description="Requesting water bottles and biscuits",
    )
    assert res["priority"] == "low"
    assert res["score"] < 25


async def test_triage_edge_cases():
    """Empty descriptions, None values, huge population counts, and mixed-case keywords."""
    # 1. Empty description
    res_empty = triage_incident("rescue", 2, "")
    assert res_empty["breakdown"]["keyword_score"] == 0
    assert res_empty["breakdown"]["matched_keywords"] == []

    # 2. None description
    res_none = triage_incident("other", 1, None)
    assert res_none["score"] == 10  # 5 category + 5 people
    assert res_none["priority"] == "low"

    # 3. Huge population count (100,000 affected) capped cleanly at 40 points
    res_huge = triage_incident("rescue", 100000, "Road blocked")
    assert res_huge["breakdown"]["people_score"] == 40

    # 4. Zero or negative population count defaults safely to 5 points
    res_zero = triage_incident("medical", 0, "help")
    assert res_zero["breakdown"]["people_score"] == 5

    # 5. Mixed-case and noisy keywords (TRAPPED, dRoWnInG, ChIlD)
    res_case = triage_incident("other", 1, "Victim is TRAPPED and dRoWnInG with a ChIlD")
    signals = res_case["breakdown"]["matched_keywords"]
    assert "trapped" in signals
    assert "drowning" in signals
    assert "child" in signals


async def test_triage_modules_are_identical():
    """
    Consistency rule: backend/app/triage.py and lambda/triage.py MUST remain
    byte-for-byte identical so Lambda auto-triage and backend rules never diverge.
    """
    import pathlib
    repo_root = pathlib.Path(__file__).parent.parent.parent
    backend_triage = (repo_root / "backend" / "app" / "triage.py").read_text(encoding="utf-8").strip()
    lambda_triage = (repo_root / "lambda" / "triage.py").read_text(encoding="utf-8").strip()

    assert backend_triage == lambda_triage, (
        "backend/app/triage.py and lambda/triage.py have diverged! "
        "Keep both files identical."
    )


# ── 2. Internal Triage API Endpoint & Auth Tests ─────────────

async def test_internal_triage_auth_missing_and_invalid(client: AsyncClient):
    """POST /internal/incidents/{id}/triage must reject requests without valid X-Internal-Token."""
    # 1. Missing header -> 401
    resp_no_header = await client.post("/internal/incidents/1/triage", json={"priority": "critical", "triage_reason": "test", "score": 80})
    assert resp_no_header.status_code == 401

    # 2. Wrong header -> 401
    resp_bad_header = await client.post(
        "/internal/incidents/1/triage",
        json={"priority": "critical", "triage_reason": "test", "score": 80},
        headers={"X-Internal-Token": "completely-wrong-token"},
    )
    assert resp_bad_header.status_code == 401


async def test_internal_triage_success_and_idempotence(client: AsyncClient):
    """Valid internal triage request updates priority, writes status history, and is idempotent."""
    settings = get_settings()
    token = await register_and_login(client, "Triage Reporter", "triage_rep@test.com", "Pass1234")

    # Create incident (starts at default priority 'medium')
    create_resp = await client.post(
        "/incidents",
        json={"category": "rescue", "description": "People trapped in flooding", "location_text": "Aundh, Pune", "people_affected": 8},
        headers=auth_header(token),
    )
    assert create_resp.status_code == 201
    inc_id = create_resp.json()["id"]
    assert create_resp.json()["priority"] in ("pending", "medium")

    internal_headers = {"X-Internal-Token": settings.INTERNAL_TOKEN}
    triage_payload = {
        "priority": "critical",
        "triage_reason": "Score 85 (CRITICAL): Category 'rescue' (+35), trapped (+15)",
        "score": 85,
    }

    # 1. First triage call: updates priority and records history
    triage_resp = await client.post(
        f"/internal/incidents/{inc_id}/triage",
        json=triage_payload,
        headers=internal_headers,
    )
    assert triage_resp.status_code == 200
    data = triage_resp.json()
    assert data["priority"] == "critical"
    assert data["triage_score"] == 85
    assert data["auto_triaged_at"] is not None

    # Check incident detail shows history note
    detail_resp = await client.get(f"/incidents/{inc_id}", headers=auth_header(token))
    history = detail_resp.json()["status_history"]
    history_notes = [h.get("note") for h in history if h.get("note")]
    assert any("Auto-triaged by system" in note for note in history_notes)
    initial_history_len = len(history)

    # 2. Idempotent second triage call: returns same incident without adding duplicate history notes
    idempotent_resp = await client.post(
        f"/internal/incidents/{inc_id}/triage",
        json=triage_payload,
        headers=internal_headers,
    )
    assert idempotent_resp.status_code == 200

    detail_after = await client.get(f"/incidents/{inc_id}", headers=auth_header(token))
    assert len(detail_after.json()["status_history"]) == initial_history_len


async def test_internal_triage_preserves_admin_manually_set_priority(client: AsyncClient):
    """If an admin has already set the priority, auto-triage updates score/reason but does NOT overwrite admin priority."""
    settings = get_settings()
    admin_token = await create_user_with_role(RoleEnum.admin, "Manual Admin", "admin_man@test.com")
    citizen_token = await register_and_login(client, "Manual Cit", "cit_man@test.com", "Pass1234")

    # Citizen creates incident
    create_resp = await client.post(
        "/incidents",
        json={"category": "rescue", "description": "Minor water logging", "location_text": "Kothrud", "people_affected": 2},
        headers=auth_header(citizen_token),
    )
    inc_id = create_resp.json()["id"]

    # Admin manually sets priority to 'low'
    admin_update = await client.patch(
        f"/incidents/{inc_id}/priority",
        json={"priority": "low"},
        headers=auth_header(admin_token),
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["priority"] == "low"

    # Auto-triage runs suggesting 'high'
    internal_headers = {"X-Internal-Token": settings.INTERNAL_TOKEN}
    triage_resp = await client.post(
        f"/internal/incidents/{inc_id}/triage",
        json={"priority": "high", "triage_reason": "High priority evaluation", "score": 60},
        headers=internal_headers,
    )
    assert triage_resp.status_code == 200
    # Priority is preserved as 'low' (admin choice respected)
    assert triage_resp.json()["priority"] == "low"
    assert triage_resp.json()["triage_score"] == 60


# ── 3. SQS & SNS Real Moto Integration Tests ──────────────────

async def test_sqs_enqueue_and_sns_publish_with_moto(monkeypatch):
    """Test real boto3 SQS send_message and SNS publish using moto."""
    settings = get_settings()
    monkeypatch.setattr(settings, "USE_AWS", True)
    monkeypatch.setattr(settings, "AWS_REGION", "us-east-1")

    with mock_aws():
        sqs = boto3.client("sqs", region_name="us-east-1")
        queue_res = sqs.create_queue(QueueName="disaster-test-queue")
        queue_url = queue_res["QueueUrl"]
        monkeypatch.setattr(settings, "SQS_QUEUE_URL", queue_url)

        sns = boto3.client("sns", region_name="us-east-1")
        topic_res = sns.create_topic(Name="disaster-test-alerts")
        topic_arn = topic_res["TopicArn"]
        monkeypatch.setattr(settings, "SNS_TOPIC_ARN", topic_arn)

        # 1. Test SQS enqueue
        enqueued = await enqueue_incident_processing(
            incident_id=101,
            category="rescue",
            people_affected=5,
            description="People on roof",
            location_text="Pune",
        )
        assert enqueued is True

        # Read message from SQS to verify payload
        sqs_msgs = sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=1)
        assert "Messages" in sqs_msgs
        msg_body = json.loads(sqs_msgs["Messages"][0]["Body"])
        assert msg_body["event"] == "incident.created"
        assert msg_body["incident_id"] == 101
        assert msg_body["category"] == "rescue"

        # 2. Test SNS publish
        published = await publish_disaster_alert(
            subject="[Disaster Alert] Incident #101 [HIGH] - RESCUE",
            message="Details regarding incident 101",
        )
        assert published is True


async def test_sqs_failure_does_not_break_incident_submission(client: AsyncClient, monkeypatch):
    """Even if SQS fails or is unreachable, incident submission still returns 201."""
    token = await register_and_login(client, "SQS Resilient", "sqs_res@test.com", "Pass1234")

    # Simulate SQS outage by monkeypatching enqueue_incident_processing to fail
    async def mock_fail_enqueue(*args, **kwargs):
        return False

    with patch("app.routers.incidents.enqueue_incident_processing", side_effect=mock_fail_enqueue):
        resp = await client.post(
            "/incidents",
            json={"category": "medical", "description": "Need bandage and first aid", "location_text": "Camp, Pune", "people_affected": 2},
            headers=auth_header(token),
        )
        assert resp.status_code == 201
        assert resp.json()["category"] == "medical"


# ── 4. AWS Lambda Handler Tests ───────────────────────────────

async def test_lambda_handler_success(monkeypatch):
    """Lambda consumes SQS record, calls API successfully, publishes SNS alert, returns 0 failures."""
    sample_sqs_event = {
        "Records": [
            {
                "messageId": "msg-001-success",
                "body": json.dumps({
                    "event": "incident.created",
                    "incident_id": 42,
                    "category": "rescue",
                    "people_affected": 10,
                    "description": "Residents trapped on second floor by flood waters",
                    "location_text": "Shivaji Nagar",
                }),
            }
        ]
    }

    with mock_aws():
        sns = boto3.client("sns", region_name="us-east-1")
        topic = sns.create_topic(Name="test-lambda-topic")
        monkeypatch.setenv("SNS_TOPIC_ARN", topic["TopicArn"])
        monkeypatch.setenv("AWS_REGION", "us-east-1")

        # Mock the HTTP call to internal API as successful
        with patch("lambda_function.send_triage_to_api", return_value={"status": "ok"}) as mock_api:
            res = lambda_function.handler(sample_sqs_event, None)
            assert res == {"batchItemFailures": []}
            assert mock_api.called


async def test_lambda_handler_malformed_record():
    """Lambda reports malformed/bad JSON records as failed in batchItemFailures."""
    bad_sqs_event = {
        "Records": [
            {
                "messageId": "msg-bad-json",
                "body": "THIS IS NOT VALID JSON!",
            }
        ]
    }

    res = lambda_function.handler(bad_sqs_event, None)
    assert res == {"batchItemFailures": [{"itemIdentifier": "msg-bad-json"}]}


async def test_lambda_handler_api_failure(monkeypatch):
    """When internal API call fails, Lambda reports the item as failed for SQS retry."""
    sqs_event = {
        "Records": [
            {
                "messageId": "msg-api-fail",
                "body": json.dumps({
                    "event": "incident.created",
                    "incident_id": 99,
                    "category": "medical",
                    "people_affected": 3,
                    "description": "Emergency patient",
                    "location_text": "Pune",
                }),
            }
        ]
    }

    # Simulate API failure
    with patch("lambda_function.send_triage_to_api", side_effect=RuntimeError("Connection refused")):
        res = lambda_function.handler(sqs_event, None)
        assert res == {"batchItemFailures": [{"itemIdentifier": "msg-api-fail"}]}
