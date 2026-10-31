from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, EmailStr, Field

class DemoRegistrationRequest(BaseModel):
    callsign: str = Field(..., min_length=2, max_length=24)
    email: EmailStr
    difficulty: Literal["recruit", "veteran", "elite"] = "veteran"

class EmailThreat(BaseModel):
    id: str
    sender: str
    sender_email: str = "threat@bot.internal"
    subject: str
    category: Literal["phishing", "spam", "newsletter", "social", "promotions", "finance", "work", "personal"]
    threat_level: int = Field(default=3, ge=1, le=5)
    action: Optional[Literal["purge", "archive", "quarantine", "filter", "protect"]] = None
    applied_in_session: bool = False
    opt_out_link: Optional[str] = None
    message_count: int = 1
    message_ids: List[str] = []

class SessionState(BaseModel):
    session_id: str
    callsign: str
    email: str
    difficulty: str
    threats_total: int
    threats_neutralized: int
    inbox_integrity: float = 100.0
    is_real_gmail: bool = False
    threats: List[EmailThreat] = []

class SenderCluster(BaseModel):
    sender_email: str
    sender_name: str
    email_count: int
    latest_date: str
    sample_subjects: List[str]
    category: str
    confidence: float
    clutter_score: float
    recommended_action: str
    opt_out_link: Optional[str] = None
    message_ids: List[str]

class InboxAnalysisSummary(BaseModel):
    total_messages_scanned: int
    clutter_messages_count: int
    total_clusters: int
    top_senders: List[SenderCluster]
    clutter_ratio: float

# ZEROHOUR ADAPTIVE CAMPAIGN ENGINE MODELS
class AdaptiveMission(BaseModel):
    mission_id: str
    title: str
    mission_type: Literal["eliminate_clutter", "stop_reinforcements", "secure_archives", "protect_intelligence", "perimeter_control"]
    objective_text: str
    target_senders: List[SenderCluster]
    affected_emails: int
    proposed_action: Literal["archive", "filter", "unsubscribe", "label", "protect"]
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    is_completed: bool = False
    is_approved: bool = False

class AdaptiveCampaign(BaseModel):
    campaign_id: str
    title: str
    description: str
    inbox_clutter_score: float
    total_clutter_emails: int
    missions: List[AdaptiveMission]
    is_real_gmail: bool = False

class CleanupOperationRequest(BaseModel):
    session_id: str
    operations: List[Dict[str, Any]]

class ExecutionAuditItem(BaseModel):
    operation_id: str
    target_sender: str
    action: str
    status: Literal["PLANNED", "CONFIRMED", "EXECUTING", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"]
    message_count: int
    details: str
    timestamp: str

class AuditReport(BaseModel):
    total_operations: int
    succeeded: int
    failed: int
    archived_emails: int
    filters_created: int
    items: List[ExecutionAuditItem]
