import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.security import sanitize_input_text, timing_safe_verify

client = TestClient(app)

def test_owasp_security_headers_present():
    """Verify all mandatory OWASP defense headers are attached to responses."""
    res = client.get("/healthz")
    assert res.status_code == 200
    headers = res.headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-xss-protection"] == "1; mode=block"
    assert "default-src 'self'" in headers["content-security-policy"]
    assert "strict-origin-when-cross-origin" in headers["referrer-policy"]
    assert "camera=()" in headers["permissions-policy"]

def test_input_sanitization():
    """Verify XSS and control sequences are neutralized."""
    dirty = "<script>alert('pwned')</script>\n\tTest Callsign"
    clean = sanitize_input_text(dirty, 50)
    assert "<script>" not in clean
    assert "&lt;script&gt;" in clean
    assert "\n" not in clean

def test_timing_safe_state_verification():
    """Verify constant-time token comparison works correctly."""
    token_a = "SECURE_TOKEN_XYZ_12345"
    token_b = "SECURE_TOKEN_XYZ_12345"
    token_diff = "FORGED_TOKEN_ABC_99999"
    assert timing_safe_verify(token_a, token_b) is True
    assert timing_safe_verify(token_a, token_diff) is False

def test_callsign_validation_rejection():
    """Verify malicious callsign injections are rejected by schema."""
    res = client.post("/api/demo/register", json={
        "callsign": "BAD$CALLSIGN#DROP TABLE",
        "email": "test@valid.com",
        "difficulty": "veteran"
    })
    assert res.status_code == 422
