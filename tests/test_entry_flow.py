from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_3d_demo_registration():
    res = client.post("/api/demo/register", json={
        "callsign": "TASK-FORCE-141",
        "email": "price@zerohour.internal",
        "difficulty": "veteran"
    })
    assert res.status_code == 200
    assert res.json()["threats_total"] == 10
