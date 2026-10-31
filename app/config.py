import os
from pydantic import BaseModel

class Settings(BaseModel):
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "zerohour-tactical-secret-key-32b")

settings = Settings()
