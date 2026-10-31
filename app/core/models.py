from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set
from pydantic import BaseModel, ConfigDict, Field, field_validator

class EmailState(str, Enum):
    INBOX = "inbox"
    ARCHIVED = "archived"
    TRASHED = "trashed"

class Action(str, Enum):
    KEEP = "keep"
    ARCHIVE = "archive"
    TRASH = "trash"
    UNSUBSCRIBE = "unsubscribe"

class Category(str, Enum):
    NEWSLETTER = "newsletter"
    PROMOTION = "promotion"
    SOCIAL = "social"
    RECEIPT = "receipt"
    SECURITY = "security"
    FINANCE = "finance"
    PERSONAL = "personal"
    WORK = "work"
    NOTIFICATION = "notification"
    OTHER = "other"

class DecisionSource(str, Enum):
    GEMINI = "gemini"
    HEURISTIC = "heuristic"

class ExecutionStatus(str, Enum):
    MANUAL_FOLLOWUP = "manual_followup"
    PENDING_GMAIL_IMPORT = "pending_gmail_import"
    APPLIED_IN_SESSION = "applied_in_session"

class Email(BaseModel):
    id: str
    sender_name: str
    sender_address: str
    sender_domain: str
    subject: str
    subject_template: str
    date: datetime
    snippet: str
    unread: bool
    has_unsubscribe: bool
    unsubscribe_target: Optional[str] = None
    protected_flag: bool = False
    state: EmailState = EmailState.INBOX

class DecisionRecord(BaseModel):
    decision_id: str
    action: Action
    timestamp: datetime
    confirmed: bool = False

class Cluster(BaseModel):
    cluster_id: str
    sender_name: str
    sender_address: str
    sender_domain: str
    role_hint: Optional[str] = None
    email_ids: List[str]
    count: int
    unread_count: int
    unread_ratio: float
    date_range: str
    has_unsubscribe: bool
    unsubscribe_targets: List[str]
    sample_subjects: List[str]
    sample_snippet: str
    protected: bool
    category: Optional[Category] = None
    suggested_action: Optional[Action] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None
    decision_source: Optional[DecisionSource] = None
    is_boss: bool = False
    status: str = "open"
    decision: Optional[DecisionRecord] = None

class AuditEntry(BaseModel):
    entry_id: str
    decision_id: str
    cluster_id: str
    action: Action
    timestamp: datetime
    is_reversal: bool = False
    items_affected: int
    details: Dict[str, Any] = Field(default_factory=dict)

class Receipt(BaseModel):
    cluster_id: str
    decision_id: str
    timestamp: str
    items_processed: int
    archived_in_session: int
    trashed_in_session: int
    kept: int
    protected_untouched: int
    unsubscribe_links_exported: int
    execution_status: ExecutionStatus

class CardView(BaseModel):
    cluster_id: str
    sender_name: str
    sender_address: str
    count: int
    unread_count: int
    sample_subjects: List[str]
    date_range: str
    category: Optional[Category] = None
    suggested_action: Optional[Action] = None
    confidence: Optional[float] = None
    reason: Optional[str] = None
    decision_source: Optional[DecisionSource] = None
    is_boss: bool = False
    protected: bool = False
    status: str = "open"
    decision: Optional[DecisionRecord] = None

class SessionContext(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    session_id: str = Field(..., description="Unique session identifier")
    score: int = Field(default=0, ge=0)
    combo: int = Field(default=0, ge=0)
    max_combo: int = Field(default=0, ge=0)
    decisions_count: int = Field(default=0, ge=0)
    total_emails: int = Field(default=0, ge=0)
    achievements: List[str] = Field(default_factory=list)
    audit_log: List[AuditEntry] = Field(default_factory=list)
    receipts: Dict[str, Receipt] = Field(default_factory=dict)
    consumed_decision_ids: Set[str] = Field(default_factory=set)
    undone_decision_ids: Set[str] = Field(default_factory=set)

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        clean = str(v).strip()
        if not clean:
            raise ValueError("session_id cannot be empty")
        return clean

    @classmethod
    def from_session_data(cls, session: Any) -> "SessionContext":
        return cls(
            session_id=session.session_id,
            score=session.score,
            combo=session.combo,
            max_combo=session.max_combo,
            decisions_count=session.decisions_count,
            total_emails=len(session.emails),
            achievements=list(session.achievements),
            audit_log=session.audit_log,
            receipts=session.receipts,
            consumed_decision_ids=session.consumed_decision_ids,
            undone_decision_ids=session.undone_decision_ids,
        )

    def sync_to_session_data(self, session: Any) -> None:
        session.score = self.score
        session.combo = self.combo
        session.max_combo = self.max_combo
        session.decisions_count = self.decisions_count
        session.achievements = list(self.achievements)

    def sync_to_dict(self, target_dict: dict) -> None:
        target_dict["score"] = self.score
        target_dict["combo"] = self.combo
        target_dict["max_combo"] = self.max_combo
        target_dict["decisions_count"] = self.decisions_count
        target_dict["achievements"] = list(self.achievements)
        target_dict["audit_log"] = self.audit_log
        target_dict["receipts"] = self.receipts
        target_dict["consumed_decision_ids"] = self.consumed_decision_ids
        target_dict["undone_decision_ids"] = self.undone_decision_ids
