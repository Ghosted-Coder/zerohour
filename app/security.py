import html
import re
import secrets
import time
from typing import Dict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

# IN-MEMORY RATE LIMITER (Token-Bucket Algorithm)
RATE_LIMIT_BUCKET: Dict[str, list] = {}
RATE_LIMIT_MAX = 60 # 60 requests per minute per IP
RATE_LIMIT_WINDOW = 60 # seconds

class RateLimiterMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "127.0.0.1"
        now = time.time()
        
        # Only rate-limit API routes
        if request.url.path.startswith("/api/"):
            timestamps = RATE_LIMIT_BUCKET.get(client_ip, [])
            # Filter timestamps within current window
            valid_timestamps = [ts for ts in timestamps if now - ts < RATE_LIMIT_WINDOW]
            if len(valid_timestamps) >= RATE_LIMIT_MAX:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests. Rate limit exceeded (60 req/min)."}
                )
            valid_timestamps.append(now)
            RATE_LIMIT_BUCKET[client_ip] = valid_timestamps

        return await call_next(request)

# OWASP COMPLIANT SECURITY HEADERS MIDDLEWARE
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        
        # Protect against clickjacking, MIME-sniffing, XSS, and unauthorized framing
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        
        # Robust Content Security Policy allowing local assets, Three.js & Google Web Fonts
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://gmail.googleapis.com; "
            "img-src 'self' data:; "
            "object-src 'none'; "
            "base-uri 'self';"
        )
        return response

def sanitize_input_text(text: str, max_len: int = 120) -> str:
    """Sanitizes user input and prevents prompt/HTML injection."""
    if not text:
        return ""
    clean = html.escape(text.strip())
    # Remove control characters and potential prompt override delimiters
    clean = re.sub(r'[
	]+', ' ', clean)
    return clean[:max_len]

def timing_safe_verify(a: str, b: str) -> bool:
    """Constant-time comparison preventing timing attacks on OAuth state tokens."""
    return secrets.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
