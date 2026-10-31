from typing import List, Optional, Literal
from pydantic import BaseModel, EmailStr, Field

class DemoRegistrationRequest(BaseModel):
    callsign: str = Field(..., min_length=2, max_length=24, description="Tactical Callsign")
    email: EmailStr = Field(..., description="Demo identification email")
    difficulty: Literal["recruit", "veteran", "elite"] = Field(
        default="veteran", description="Operation threat intensity"
    )

class EmailThreat(BaseModel):
    id: str
    sender: str
    subject: str
    category: Literal["phishing", "spam", "newsletter", "cold_outreach"]
    threat_level: int = Field(..., ge=1, le=5)
    action: Optional[Literal["purge", "archive", "quarantine"]] = None
    applied_in_session: bool = False
    opt_out_link: Optional[str] = None

class SessionState(BaseModel):
    session_id: str
    callsign: str
    email: str
    difficulty: str
    threats_total: int
    threats_neutralized: int
    inbox_integrity: float = 100.0
    filters_generated: int = 0
    threats: List[EmailThreat] = []
