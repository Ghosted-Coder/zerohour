import secrets
import urllib.parse
from typing import Dict, Optional
import httpx
from app.config import settings

# In-memory secure server token vault (keyed by state/session_id)
TOKEN_VAULT: Dict[str, dict] = {}
OAUTH_STATES: Dict[str, str] = {}

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic"
]

def generate_google_auth_url(session_id: str) -> str:
    state = secrets.token_urlsafe(24)
    OAUTH_STATES[state] = session_id
    
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
    session_id = OAUTH_STATES.pop(state, None)
    if not session_id:
        return None

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
