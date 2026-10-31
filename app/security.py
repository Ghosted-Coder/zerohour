import html
import secrets
import time
from typing import Dict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

RATE_LIMIT_BUCKET: Dict[str, list] = {}
RATE_LIMIT_MAX = 120
RATE_LIMIT_WINDOW = 60

class RateLimiterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        if request.url.path.startswith("/api/"):
            timestamps = RATE_LIMIT_BUCKET.get(client_ip, [])
            valid = [ts for ts in timestamps if now - ts < RATE_LIMIT_WINDOW]
            if len(valid) >= RATE_LIMIT_MAX:
                return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
            valid.append(now)
            RATE_LIMIT_BUCKET[client_ip] = valid
        return await call_next(request)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissive CSP for Local Three.js WebGL & Google Services
        response.headers["Content-Security-Policy"] = (
            "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; "
            "script-src * 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; "
            "style-src * 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src * https://fonts.gstatic.com; "
            "connect-src *; "
            "img-src * data: blob:;"
        )
        return response

def sanitize_input_text(text: str, max_len: int = 120) -> str:
    if not text:
        return ""
    clean = html.escape(str(text).strip())
    for code in (10, 13, 9):
        clean = clean.replace(chr(code), " ")
    return clean[:max_len]

def timing_safe_verify(a: str, b: str) -> bool:
    return secrets.compare_digest(str(a).encode("utf-8"), str(b).encode("utf-8"))
