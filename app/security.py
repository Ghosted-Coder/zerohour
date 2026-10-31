import time
from collections import defaultdict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        res = await call_next(request)
        res.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';"
        res.headers["X-Content-Type-Options"] = "nosniff"
        res.headers["X-Frame-Options"] = "DENY"
        return res

class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_per_minute=120):
        super().__init__(app)
        self.max_per_minute = max_per_minute
        self.requests = defaultdict(list)

    async def dispatch(self, request, call_next):
        if request.url.path == "/health":
            return await call_next(request)
        ip = request.headers.get("x-forwarded-for", "127.0.0.1").split(",")[0].strip()
        now = time.time()
        self.requests[ip] = [t for t in self.requests[ip] if t > now - 60.0]
        if len(self.requests[ip]) >= self.max_per_minute:
            return JSONResponse(status_code=429, content={"error": {"code": "rate_limited", "message": "Too many requests"}})
        self.requests[ip].append(now)
        return await call_next(request)
