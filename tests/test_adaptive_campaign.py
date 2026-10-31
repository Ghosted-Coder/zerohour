import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.inbox_intelligence import cluster_and_analyze_messages
from app.services.adaptive_campaign import generate_personalized_campaign

client = TestClient(app)

def test_adaptive_campaign_generation():
    raw_mock = [
        {"id": "m1", "from": "Deal Bot <promo@deals.com>", "subject": "80% Off Gadgets", "list_unsubscribe": "http://deals.com/unsub", "snippet": "discounts"},
        {"id": "m2", "from": "Deal Bot <promo@deals.com>", "subject": "Flash Sale Ends Tonight", "list_unsubscribe": "http://deals.com/unsub", "snippet": "sale"},
        {"id": "m3", "from": "Newsletter <news@weekly.io>", "subject": "Tech Weekly", "list_unsubscribe": "http://weekly.io/unsub", "snippet": "digest"},
        {"id": "m4", "from": "Bank Alert <alert@chase.com>", "subject": "Your Monthly Statement", "list_unsubscribe": None, "snippet": "statement"}
    ]
    summary = cluster_and_analyze_messages(raw_mock)
    campaign = generate_personalized_campaign(summary, "ZH-TEST", is_real=False)

    assert len(campaign.missions) >= 2
    # Verify mission types
    types = [m.mission_type for m in campaign.missions]
    assert "eliminate_clutter" in types
    assert "stop_reinforcements" in types

def test_protected_emails_never_flagged_for_purge():
    raw_mock = [
        {"id": "m1", "from": "Payroll <hr@company.com>", "subject": "Monthly Salary Invoice", "list_unsubscribe": None, "snippet": "receipt invoice salary"},
        {"id": "m2", "from": "Bank <secure@bank.com>", "subject": "OTP Security Code", "list_unsubscribe": None, "snippet": "verification"}
    ]
    summary = cluster_and_analyze_messages(raw_mock)
    for s in summary.top_senders:
        assert s.category == "finance"
        assert s.recommended_action == "Keep in Inbox"

def test_campaign_api_endpoint():
    res = client.post("/api/demo/register", json={
        "callsign": "SPECTRE-01",
        "email": "spectre@zerohour.internal",
        "difficulty": "veteran"
    })
    session_id = res.json()["session_id"]
    camp_res = client.get(f"/api/campaign/{session_id}")
    assert camp_res.status_code == 200
    data = camp_res.json()
    assert "missions" in data
    assert len(data["missions"]) > 0
