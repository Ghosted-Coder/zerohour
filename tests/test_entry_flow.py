from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_recruit_spawns_16_enemies():
    res = client.post("/api/demo/register", json={
        "callsign": "RECRUIT-01",
        "email": "test@recruit.com",
        "difficulty": "recruit"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["threats_total"] == 16
    assert len(data["threats"]) == 16

def test_veteran_spawns_24_enemies():
    res = client.post("/api/demo/register", json={
        "callsign": "VET-01",
        "email": "test@veteran.com",
        "difficulty": "veteran"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["threats_total"] == 24
    assert len(data["threats"]) == 24

def test_elite_spawns_32_enemies():
    res = client.post("/api/demo/register", json={
        "callsign": "ELITE-01",
        "email": "test@elite.com",
        "difficulty": "elite"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["threats_total"] == 32
    assert len(data["threats"]) == 32
