"""
End-to-end verification script:
Tests the complete lifecycle of an emergency incident against the live backend:
1. Citizen logs in with seeded credentials
2. Citizen reports a new emergency
3. Citizen verifies incident is in 'My Requests'
4. Admin logs in with seeded credentials
5. Admin updates incident priority to 'critical'
6. Admin selects an available team and assigns it (team becomes unavailable)
7. Responder logs in with seeded credentials
8. Responder updates status to 'in_progress' with notes
9. Responder resolves the incident (assigned team is freed and becomes available)
10. Citizen fetches incident detail and confirms 'resolved' status, assignments, and status history timeline
"""

import httpx
import sys

BASE_URL = "http://127.0.0.1:8000"


def log_step(step_num: int, title: str):
    print(f"\n[{step_num}] {title}")


def main():
    client = httpx.Client(base_url=BASE_URL, timeout=10.0)

    # Health check
    resp = client.get("/health")
    assert resp.status_code == 200, f"Health check failed: {resp.text}"
    print("[OK] Health check: Backend is running smoothly.")

    # ── 1. Citizen Login ──────────────────────────────────────
    log_step(1, "Citizen Login (citizen@disaster.io)")
    resp = client.post("/auth/login", json={"email": "citizen@disaster.io", "password": "cit123"})
    assert resp.status_code == 200, f"Citizen login failed: {resp.text}"
    citizen_token = resp.json()["access_token"]
    citizen_headers = {"Authorization": f"Bearer {citizen_token}"}
    print("  -> Authenticated as Citizen")

    # ── 2. Citizen Reports Emergency ──────────────────────────
    log_step(2, "Citizen Reports New Emergency")
    incident_payload = {
        "category": "rescue",
        "description": "Flash flooding near Deccan Gymkhana, Pune. 8 families trapped inside an apartment building.",
        "location_text": "Deccan Gymkhana, Pune, Maharashtra",
        "latitude": 18.5173,
        "longitude": 73.8415,
        "people_affected": 24,
    }
    resp = client.post("/incidents", json=incident_payload, headers=citizen_headers)
    assert resp.status_code == 201, f"Create incident failed: {resp.text}"
    incident = resp.json()
    incident_id = incident["id"]
    print(f"  -> Incident #{incident_id} created with status '{incident['status']}' and priority '{incident['priority']}'")

    # ── 3. Citizen Checks Own Incidents ───────────────────────
    log_step(3, "Citizen Checks 'My Requests' List")
    resp = client.get("/incidents/mine", headers=citizen_headers)
    assert resp.status_code == 200
    my_list = resp.json()
    assert any(i["id"] == incident_id for i in my_list), "Reported incident not in citizen's list"
    print(f"  -> Incident #{incident_id} confirmed in citizen's requests (Total: {len(my_list)})")

    # ── 4. Admin Login ────────────────────────────────────────
    log_step(4, "Admin Login (admin@disaster.io)")
    resp = client.post("/auth/login", json={"email": "admin@disaster.io", "password": "admin123"})
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    admin_token = resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    print("  -> Authenticated as Admin")

    # ── 5. Admin Sets Priority to Critical ────────────────────
    log_step(5, "Admin Sets Incident Priority to 'critical'")
    resp = client.patch(f"/incidents/{incident_id}/priority", json={"priority": "critical"}, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["priority"] == "critical"
    print(f"  -> Priority updated to: {resp.json()['priority']}")

    # ── 6. Admin Dispatches Available Team ────────────────────
    log_step(6, "Admin Dispatches an Available Team")
    # Fetch available teams
    resp = client.get("/teams", headers=admin_headers)
    assert resp.status_code == 200
    available_teams = [t for t in resp.json() if t["is_available"]]
    assert len(available_teams) > 0, "No available teams found"
    selected_team = available_teams[0]
    print(f"  -> Dispatching Team #{selected_team['id']}: {selected_team['name']} ({selected_team['type']})")

    resp = client.post(f"/incidents/{incident_id}/assign", json={"team_id": selected_team["id"]}, headers=admin_headers)
    assert resp.status_code == 201, f"Assign team failed: {resp.text}"

    # Verify team is now marked unavailable
    resp = client.get(f"/teams/{selected_team['id']}", headers=admin_headers)
    assert resp.json()["is_available"] is False, "Team should be unavailable after assignment"
    print(f"  -> Team '{selected_team['name']}' availability: False (Busy)")

    # ── 7. Responder Login ────────────────────────────────────
    log_step(7, "Responder Login (responder@disaster.io)")
    resp = client.post("/auth/login", json={"email": "responder@disaster.io", "password": "resp123"})
    assert resp.status_code == 200, f"Responder login failed: {resp.text}"
    responder_token = resp.json()["access_token"]
    responder_headers = {"Authorization": f"Bearer {responder_token}"}
    print("  -> Authenticated as Responder")

    # ── 8. Responder Moves Status to In Progress ──────────────
    log_step(8, "Responder Updates Status to 'in_progress'")
    resp = client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "in_progress", "note": "Rescue boats deployed at Deccan Gymkhana"},
        headers=responder_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"
    print("  -> Status is now 'in_progress' with operational note recorded")

    # ── 9. Responder Resolves Incident & Frees Team ───────────
    log_step(9, "Responder Updates Status to 'resolved' (Auto-frees team)")
    resp = client.patch(
        f"/incidents/{incident_id}/status",
        json={"status": "resolved", "note": "All 24 people evacuated safely to relief center"},
        headers=responder_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"

    # Verify team availability is restored to True
    resp = client.get(f"/teams/{selected_team['id']}", headers=admin_headers)
    assert resp.json()["is_available"] is True, "Team should be freed when incident is resolved"
    print(f"  -> Incident resolved! Team '{selected_team['name']}' availability restored: True (Available)")

    # ── 10. Citizen Sees Final Status & Complete History ──────
    log_step(10, "Citizen Fetches Incident Detail & History Timeline")
    resp = client.get(f"/incidents/{incident_id}", headers=citizen_headers)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["status"] == "resolved"
    assert len(detail["assignments"]) >= 1
    assert len(detail["status_history"]) >= 2
    print(f"  -> Final Status: {detail['status']}")
    print(f"  -> Priority: {detail['priority']}")
    print(f"  -> Assignments: {len(detail['assignments'])} team assigned")
    print(f"  -> Status History Entries: {len(detail['status_history'])}")
    for h in detail["status_history"]:
        print(f"     • {h['old_status']} -> {h['new_status']} (Note: {h.get('note') or 'None'})")

    print("\n=======================================================")
    print(" SUCCESS: Complete End-to-End Simulation Flow Verified!")
    print(" Citizen reports -> Admin assigns -> Responder updates -> Citizen sees history")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
