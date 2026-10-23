"""
Asynchronous Load Testing & Queue Buffering Benchmark Tool
Disaster Management and Emergency Response Platform

Demonstrates decoupling and queue buffering:
Submits N incidents concurrently to POST /incidents, measures submission latency,
then polls until all incidents are auto-triaged by the SQS -> Lambda consumer pipeline.

Usage:
  python scripts/load_test.py --base-url http://localhost:8000 --count 300 --concurrency 20
"""

import argparse
import asyncio
from datetime import datetime
import statistics
import sys
import time
from typing import List, Tuple

import httpx

SAMPLE_INCIDENTS = [
    {
        "category": "rescue",
        "description": "Family with elderly grandfather trapped on roof due to rapid flooding",
        "location_text": "Warje Bridge, Pune",
        "people_affected": 6,
    },
    {
        "category": "medical",
        "description": "Multiple casualties unconscious and bleeding after wall collapse in heavy rain",
        "location_text": "Kothrud Depot, Pune",
        "people_affected": 4,
    },
    {
        "category": "rescue",
        "description": "Children stranded in school bus surrounded by rising water near river bank",
        "location_text": "Sinhagad Road, Pune",
        "people_affected": 18,
    },
    {
        "category": "shelter",
        "description": "Tin sheds blown away by gusty winds, families need temporary shelter",
        "location_text": "Hadapsar, Pune",
        "people_affected": 25,
    },
    {
        "category": "food_water",
        "description": "Drinking water pipelines contaminated, need dry rations and clean water jars",
        "location_text": "Aundh Gaon, Pune",
        "people_affected": 40,
    },
    {
        "category": "medical",
        "description": "Pregnant woman in labor unable to reach hospital due to waterlogged roads",
        "location_text": "Bavdhan, Pune",
        "people_affected": 2,
    },
    {
        "category": "other",
        "description": "Uprooted banyan tree blocking arterial road, no injuries reported",
        "location_text": "FC Road, Pune",
        "people_affected": 1,
    },
]


async def authenticate(client: httpx.AsyncClient, base_url: str, email: str, password: str) -> str:
    """Authenticates or registers citizen user and returns JWT access token."""
    login_url = f"{base_url.rstrip('/')}/auth/login"
    try:
        resp = await client.post(login_url, json={"email": email, "password": password})
        if resp.status_code == 200:
            return resp.json()["access_token"]
    except Exception:
        pass

    # Attempt registration if login fails
    reg_url = f"{base_url.rstrip('/')}/auth/register"
    reg_resp = await client.post(
        reg_url,
        json={"name": "Load Test Citizen", "email": email, "password": password},
    )
    if reg_resp.status_code in (200, 201):
        resp = await client.post(login_url, json={"email": email, "password": password})
        return resp.json()["access_token"]

    raise RuntimeError(f"Failed to authenticate user {email}: {resp.status_code if 'resp' in locals() else 'unknown'}")


async def submit_single_incident(
    client: httpx.AsyncClient,
    url: str,
    headers: dict,
    payload: dict,
    sem: asyncio.Semaphore,
) -> Tuple[bool, float, int | None]:
    """Submits one incident and records round-trip latency in milliseconds."""
    async with sem:
        start = time.perf_counter()
        try:
            resp = await client.post(url, json=payload, headers=headers, timeout=15.0)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            if resp.status_code in (200, 201):
                inc_id = resp.json().get("id")
                return True, elapsed_ms, inc_id
            return False, elapsed_ms, None
        except Exception:
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return False, elapsed_ms, None


async def run_benchmark(base_url: str, count: int, concurrency: int, email: str, password: str):
    print("=" * 70)
    print("  DISASTER PLATFORM EVENT-DRIVEN LOAD TEST & BUFFERING DEMO")
    print("=" * 70)
    print(f"Target URL       : {base_url}")
    print(f"Total Incidents  : {count}")
    print(f"Concurrency      : {concurrency}")
    print(f"Citizen Account  : {email}")
    print("-" * 70)

    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=concurrency + 10, max_keepalive_connections=concurrency)) as client:
        # Step 1: Authentication
        print("[1/3] Authenticating citizen session...")
        try:
            token = await authenticate(client, base_url, email, password)
            print("  ✓ Authenticated successfully.")
        except Exception as e:
            print(f"[ERROR] Authentication failed: {e}", file=sys.stderr)
            sys.exit(1)

        headers = {"Authorization": f"Bearer {token}"}
        incidents_url = f"{base_url.rstrip('/')}/incidents"
        sem = asyncio.Semaphore(concurrency)

        # Step 2: Concurrent submission
        print(f"\n[2/3] Firing {count} emergency incident submissions (concurrency={concurrency})...")
        tasks = []
        for i in range(count):
            template = SAMPLE_INCIDENTS[i % len(SAMPLE_INCIDENTS)]
            payload = {
                "category": template["category"],
                "description": f"{template['description']} [Batch #{i+1}]",
                "location_text": template["location_text"],
                "people_affected": template["people_affected"],
            }
            tasks.append(submit_single_incident(client, incidents_url, headers, payload, sem))

        overall_start = time.perf_counter()
        results = await asyncio.gather(*tasks)
        overall_duration = time.perf_counter() - overall_start

        # Analyze submission results
        latencies = [res[1] for res in results]
        successes = [res for res in results if res[0]]
        submitted_ids = [res[2] for res in results if res[0] and res[2] is not None]
        errors = count - len(successes)

        sorted_latencies = sorted(latencies)
        p50 = statistics.median(sorted_latencies)
        p95 = sorted_latencies[int(len(sorted_latencies) * 0.95)] if sorted_latencies else 0
        p99 = sorted_latencies[int(len(sorted_latencies) * 0.99)] if sorted_latencies else 0
        rps = count / overall_duration if overall_duration > 0 else 0

        print("\n--- Submission Phase Metrics ---")
        print(f"  Duration        : {overall_duration:.2f} seconds")
        print(f"  Throughput      : {rps:.2f} requests/sec")
        print(f"  Successful      : {len(successes)} / {count} ({(len(successes)/count)*100:.1f}%)")
        print(f"  Failed          : {errors}")
        print(f"  Latency (p50)   : {p50:.2f} ms")
        print(f"  Latency (p95)   : {p95:.2f} ms")
        print(f"  Latency (p99)   : {p99:.2f} ms")
        print(f"  Min / Max       : {min(sorted_latencies):.2f} ms / {max(sorted_latencies):.2f} ms")

        # Step 3: Monitor Queue Draining & Auto-Triage Processing
        print("\n[3/3] Monitoring queue drain & auto-triage background execution...")
        print("  (Polling GET /incidents/mine to track triage completion)")

        submitted_set = set(submitted_ids)
        drain_start = time.perf_counter()
        poll_url = f"{base_url.rstrip('/')}/incidents/mine"
        max_wait_seconds = 180
        triaged_count = 0
        priority_breakdown = {"critical": 0, "high": 0, "medium": 0, "low": 0}

        while time.perf_counter() - drain_start < max_wait_seconds:
            try:
                poll_resp = await client.get(poll_url, headers=headers, timeout=10.0)
                if poll_resp.status_code == 200:
                    my_incidents = poll_resp.json()
                    tracked = [inc for inc in my_incidents if inc["id"] in submitted_set]
                    triaged = [inc for inc in tracked if inc.get("auto_triaged_at") is not None]
                    triaged_count = len(triaged)

                    elapsed = time.perf_counter() - drain_start
                    pct = (triaged_count / len(submitted_set)) * 100 if submitted_set else 100
                    print(f"  [Queue Monitor] {triaged_count}/{len(submitted_set)} triaged ({pct:.1f}%) | Elapsed: {elapsed:.1f}s")

                    if triaged_count >= len(submitted_set) and len(submitted_set) > 0:
                        for inc in triaged:
                            p = inc.get("priority", "medium").lower()
                            priority_breakdown[p] = priority_breakdown.get(p, 0) + 1
                        break
            except Exception as e:
                print(f"  [Warning] Polling error: {e}")

            await asyncio.sleep(2.0)

        total_drain_time = time.perf_counter() - drain_start
        print("\n--- Queue Buffering & Triage Results ---")
        if triaged_count >= len(submitted_set) and len(submitted_set) > 0:
            drain_rate = len(submitted_set) / total_drain_time if total_drain_time > 0 else 0
            print(f"  ✓ All {triaged_count} incidents auto-triaged successfully!")
            print(f"  Queue Drain Time : {total_drain_time:.2f} seconds")
            print(f"  Processing Rate  : {drain_rate:.2f} incidents/second")
            print("  Priority Distribution:")
            for prio, cnt in priority_breakdown.items():
                print(f"    - {prio.capitalize():<9}: {cnt} ({(cnt/triaged_count)*100:.1f}%)")
        else:
            print(f"  ⚠ Drained {triaged_count}/{len(submitted_set)} within {max_wait_seconds}s timeout.")
            print("    Check SQS queue depth or Lambda CloudWatch logs for consumer status.")

        print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="Disaster Platform SQS/Lambda Load Tester")
    parser.add_argument("--base-url", default="http://localhost:8000", help="API Base URL (default: http://localhost:8000)")
    parser.add_argument("--count", type=int, default=300, help="Number of incidents to submit (default: 300)")
    parser.add_argument("--concurrency", type=int, default=20, help="Concurrent workers (default: 20)")
    parser.add_argument("--email", default="citizen@disaster.io", help="Citizen login email")
    parser.add_argument("--password", default="cit123", help="Citizen login password")
    args = parser.parse_args()

    asyncio.run(run_benchmark(args.base_url, args.count, args.concurrency, args.email, args.password))


if __name__ == "__main__":
    main()
