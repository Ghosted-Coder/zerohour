import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.inbox_intelligence import cluster_and_analyze_messages

client = TestClient(app)

def test_oauth_url_generation():
    res = client.get("/api/auth/google/url?session_id=ZH-TEST-001")
    assert res.status_code == 200
    data = res.json()
    assert "auth_url" in data
    assert "accounts.google.com" in data["auth_url"]

def test_inbox_clustering_and_clutter_score():
    raw_mock = [
        {"id": "m1", "from": "Newsletter <news@daily.io>", "subject": "Daily Tech Digest", "list_unsubscribe": "http://daily.io/unsub", "snippet": "tech news"},
        {"id": "m2", "from": "Newsletter <news@daily.io>", "subject": "Breaking AI Models", "list_unsubscribe": "http://daily.io/unsub", "snippet": "ai updates"},
        {"id": "m3", "from": "Bank Alert <support@bank.com>", "subject": "Your Bank Statement", "list_unsubscribe": None, "snippet": "account balance statement"}
    ]
    summary = cluster_and_analyze_messages(raw_mock)
    assert summary.total_messages_scanned == 3
    assert summary.total_clusters == 2

    # news@daily.io should be identified as newsletter
    daily_cluster = next(c for c in summary.top_senders if c.sender_email == "news@daily.io")
    assert daily_cluster.category == "newsletter"
    assert daily_cluster.email_count == 2
    assert daily_cluster.clutter_score > 0

    # Bank should be identified as finance
    bank_cluster = next(c for c in summary.top_senders if c.sender_email == "support@bank.com")
    assert bank_cluster.category == "finance"

def test_safe_execution_engine_fallback():
    payload = {
        "session_id": "TEST-SESSION-999",
        "operations": [
            {"sender_email": "spam@promos.com", "action": "archive", "message_ids": ["msg101", "msg102"]},
            {"sender_email": "newsletter@sub.com", "action": "filter", "message_ids": []}
        ]
    }
    res = client.post("/api/inbox/execute", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["total_operations"] == 2
    assert len(data["items"]) == 2
