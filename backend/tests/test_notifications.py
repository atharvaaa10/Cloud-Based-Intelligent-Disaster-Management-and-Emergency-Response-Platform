"""
Tests for Notifications endpoints:
- GET /notifications without token returns 401
- GET /notifications with authenticated citizen token returns 200 and only their own notifications
- GET /announcements works without a token (public endpoint)
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import Notification, User
from tests.test_api import auth_header, register_and_login

pytestmark = pytest.mark.asyncio


async def test_notifications_unauthenticated_returns_401(client: AsyncClient):
    """GET /notifications without token must return 401 Unauthorized."""
    resp = await client.get("/notifications")
    assert resp.status_code == 401
    assert "detail" in resp.json()


async def test_announcements_unauthenticated_returns_200(client: AsyncClient):
    """GET /announcements must be accessible publicly without any token."""
    resp = await client.get("/announcements")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "title" in data[0]
    assert "severity" in data[0]


async def test_notifications_citizen_isolation(client: AsyncClient, setup_db):
    """Authenticated citizen gets 200 and only their own notifications."""
    token_alice = await register_and_login(client, "Alice Notif", "alice.notif@test.com", "Password123!")
    token_bob = await register_and_login(client, "Bob Notif", "bob.notif@test.com", "Password123!")

    # Check Alice has 0 notifications initially
    resp_alice = await client.get("/notifications", headers=auth_header(token_alice))
    assert resp_alice.status_code == 200
    assert resp_alice.json() == []

    # Report an incident as Alice
    inc_resp = await client.post(
        "/incidents",
        json={
            "category": "rescue",
            "description": "Flooding in residential area near Paud Road.",
            "location_text": "Paud Road, Pune",
            "latitude": 18.51,
            "longitude": 73.81,
            "people_affected": 3,
        },
        headers=auth_header(token_alice),
    )
    assert inc_resp.status_code == 201

    # Verify Alice now receives a notification for her report
    resp_alice_after = await client.get("/notifications", headers=auth_header(token_alice))
    assert resp_alice_after.status_code == 200
    alice_notifs = resp_alice_after.json()
    assert len(alice_notifs) >= 1
    assert all("Report" in n["title"] or "received" in n["title"].lower() or "emergency" in n["title"].lower() for n in alice_notifs)

    # Verify Bob still sees 0 notifications (data isolation)
    resp_bob = await client.get("/notifications", headers=auth_header(token_bob))
    assert resp_bob.status_code == 200
    bob_notifs = resp_bob.json()
    assert len(bob_notifs) == 0

