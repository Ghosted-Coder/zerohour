import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_html_accessibility_structure():
    """Verify WCAG 2.1 AA structural compliance in the rendered HTML."""
    response = client.get("/")
    assert response.status_code == 200
    html = response.text
    
    # 1. html lang attribute
    assert 'lang="en"' in html
    
    # 2. Skip to main content link
    assert 'class="skip-link"' in html
    
    # 3. Canvas accessible landmark name & fallback text
    assert 'role="region"' in html
    assert 'aria-label="3D Alcatraz Island Battleground"' in html
    
    # 4. Semantic fieldset and legend for difficulty radio group
    assert '<fieldset' in html
    assert '<legend' in html
    assert 'role="radiogroup"' in html
    assert 'role="radio"' in html
    
    # 5. Dialog accessibility
    assert 'role="dialog"' in html
    assert 'aria-modal="true"' in html
    assert 'aria-labelledby="debrief-title"' in html

def test_security_raw_email_bodies_never_persisted():
    """Verify security guarantee: raw bodies are never accepted or stored."""
    res = client.post("/api/demo/register", json={
        "callsign": "SPECTRE-SAFE",
        "email": "spectre@secops.internal",
        "difficulty": "veteran"
    })
    assert res.status_code == 200
    data = res.json()
    for threat in data["threats"]:
        assert "body" not in threat
        assert "raw_content" not in threat

def test_oauth_token_vault_security():
    """Verify OAuth tokens are never leaked to client responses."""
    status_res = client.get("/api/auth/status?session_id=SEC-TEST-999")
    assert status_res.status_code == 200
    data = status_res.json()
    assert "access_token" not in data
    assert "refresh_token" not in data
