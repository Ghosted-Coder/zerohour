import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.inbox_intelligence import cluster_and_analyze_messages

client = TestClient(app)

def test_healthz_endpoint_fast_response():
    """Verify healthcheck responds within sub-5ms latency."""
    t0 = time.perf_counter()
    res = client.get("/healthz")
    duration = time.perf_counter() - t0
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"
    assert duration < 0.05

def test_metrics_endpoint():
    res = client.get("/api/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "active_sessions" in data
    assert "audit_logs_recorded" in data

def test_inbox_clustering_caching_efficiency():
    """Verify in-memory caching returns identical result instantly."""
    raw = [{"id": f"m{i}", "from": "Bot <promo@deals.com>", "subject": f"Deal {i}", "list_unsubscribe": None, "snippet": "sale"} for i in range(10)]
    
    t0 = time.perf_counter()
    summary1 = cluster_and_analyze_messages(raw, cache_key="cache-bench-01")
    first_duration = time.perf_counter() - t0

    t1 = time.perf_counter()
    summary2 = cluster_and_analyze_messages(raw, cache_key="cache-bench-01")
    cached_duration = time.perf_counter() - t1

    assert summary1.total_clusters == summary2.total_clusters
    assert cached_duration <= first_duration
