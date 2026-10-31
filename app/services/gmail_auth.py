import secrets
import time
import urllib.parse
from typing import Dict, Optional, Tuple
import httpx
from app.config import settings
from app.security import timing_safe_verify

# Hardened Server-Side Token Vault (Tokens NEVER reach frontend JavaScript)
TOKEN_VAULT: Dict[str, dict] = {}
OAUTH_STATES: Dict[str, Tuple[str, float]] = {} # state -> (session_id, created_timestamp)

STATE_TTL_SECONDS = 600 # 10 minute expiration for CSRF state tokens

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic"
]

def generate_google_auth_url(session_id: str) -> str:
    state = secrets.token_urlsafe(32)
    OAUTH_STATES[state] = (session_id, time.time())
    
    # Evict expired states
    now = time.time()
    for s in list(OAUTH_STATES.keys()):
        if now - OAUTH_STATES[s][1] > STATE_TTL_SECONDS:
            del OAUTH_STATES[s]

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

async def exchange_code_for_tokens(code: str, state: str) -> Optional[dict]:
    # Constant-time lookup & verification
    matched_state = None
    for s in list(OAUTH_STATES.keys()):
        if timing_safe_verify(s, state):
            matched_state = s
            break

    if not matched_state:
        return None

    session_id, created_at = OAUTH_STATES.pop(matched_state)
    if time.time() - created_at > STATE_TTL_SECONDS:
        return None # State expired

    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(token_url, data=data)
        if res.status_code != 200:
            return None
        token_data = res.json()
        token_data["created_at"] = time.time()
        TOKEN_VAULT[session_id] = token_data
        return token_data

async def get_valid_access_token(session_id: str) -> Optional[str]:
    tokens = TOKEN_VAULT.get(session_id)
    if not tokens:
        return None
    return tokens.get("access_token")

def is_gmail_connected(session_id: str) -> bool:
    return session_id in TOKEN_VAULT and "access_token" in TOKEN_VAULT[session_id]

def disconnect_gmail(session_id: str) -> bool:
    if session_id in TOKEN_VAULT:
        del TOKEN_VAULT[session_id]
        return True
    return False
