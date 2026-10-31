import os
from typing import List
from pydantic import BaseModel, Field

class Settings(BaseModel):
    gemini_api_key: str | None = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY"))
    gemini_model: str = Field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-2.5-flash"))
    gemini_embedding_model: str = Field(default_factory=lambda: os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-2"))
    allowed_origins: List[str] = Field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
            if origin.strip()
        ]
    )
    session_backend: str = Field(default_factory=lambda: os.getenv("SESSION_BACKEND", "memory"))
    leaderboard_backend: str = Field(default_factory=lambda: os.getenv("LEADERBOARD_BACKEND", "memory"))
    firestore_project_id: str | None = Field(default_factory=lambda: os.getenv("FIRESTORE_PROJECT_ID"))
    session_ownership_required: bool = True
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8080")))
    max_upload_bytes: int = 50 * 1024 * 1024
    max_message_buffer_bytes: int = 1 * 1024 * 1024
    max_emails_per_session: int = 10_000
    session_ttl_seconds: int = 1800
    max_concurrent_sessions: int = 20
    rate_limit_per_minute: int = 120

settings = Settings()
