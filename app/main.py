import logging, os
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.api import routes_deck, routes_decisions, routes_export, routes_health, routes_leaderboard, routes_report, routes_sessions
from app.config import settings
from app.security import RateLimitMiddleware, SecurityHeadersMiddleware

logger = logging.getLogger("zerohour")

def create_app() -> FastAPI:
    app = FastAPI(title="ZeroHour Backend", version="1.0.0", docs_url=None, redoc_url=None)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RateLimitMiddleware, max_per_minute=settings.rate_limit_per_minute)

    if settings.allowed_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        content = exc.detail if isinstance(exc.detail, dict) and "error" in exc.detail else {"error": {"code": "http_error", "message": str(exc.detail)}}
        return JSONResponse(status_code=exc.status_code, content=content)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=400, content={"error": {"code": "invalid_request", "message": str(exc.errors())}})

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled server error: %s", exc)
        return JSONResponse(status_code=500, content={"error": {"code": "internal_server_error", "message": "An unexpected server error occurred."}})

    app.include_router(routes_health.router)
    app.include_router(routes_sessions.router)
    app.include_router(routes_deck.router)
    app.include_router(routes_decisions.router)
    app.include_router(routes_report.router)
    app.include_router(routes_export.router)
    app.include_router(routes_leaderboard.router)

    static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
    os.makedirs(static_dir, exist_ok=True)
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app

app = create_app()
