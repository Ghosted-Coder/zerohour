from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_demo_registration_valid():
    payload = {
        "callsign": "VANGUARD-TEST",
        "email": "operator@zerohour.internal",
        "difficulty": "veteran"
    }
    response = client.post("/api/demo/register", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["callsign"] == "VANGUARD-TEST"
    assert data["threats_total"] == 40
    assert len(data["threats"]) == 40
    assert data["inbox_integrity"] == 100.0

def test_demo_registration_validation_errors():
    res_empty_callsign = client.post("/api/demo/register", json={
        "callsign": " ",
        "email": "test@test.com",
        "difficulty": "veteran"
    })
    assert res_empty_callsign.status_code == 400

    res_invalid_email = client.post("/api/demo/register", json={
        "callsign": "SPECTRE",
        "email": "not-an-email",
        "difficulty": "veteran"
    })
    assert res_invalid_email.status_code == 422

def test_triage_and_honest_xml_export():
    reg = client.post("/api/demo/register", json={
        "callsign": "PURGE-LEAD",
        "email": "lead@purge.org",
        "difficulty": "recruit"
    }).json()

    session_id = reg["session_id"]
    first_threat_id = reg["threats"][0]["id"]

    triage_res = client.post(f"/api/demo/session/{session_id}/triage", json={
        "threat_id": first_threat_id,
        "action": "purge"
    })
    assert triage_res.status_code == 200
    assert triage_res.json()["neutralized"] == 1

    xml_res = client.get(f"/api/demo/session/{session_id}/export/filters.xml")
    assert xml_res.status_code == 200
    assert "application/xml" in xml_res.headers["content-type"]
    assert "shouldTrash" in xml_res.text

    csv_res = client.get(f"/api/demo/session/{session_id}/export/unsubscribe.csv")
    assert csv_res.status_code == 200
    assert "ThreatID,Sender,Subject,UnsubscribeLink" in csv_res.text
