import asyncio, time, uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from app.config import settings
from app.core.models import AuditEntry, Cluster, Email, Receipt, SessionContext

class SessionData:
    def __init__(self, session_id: str, owner_id: str, owner_token: str):
        self.session_id, self.owner_id, self.owner_token = session_id, owner_id, owner_token
        self.version = 1
        self.created_at = self.last_accessed = time.time()
        self.lock = asyncio.Lock()
        self.emails: List[Email] = []
        self.emails_map: Dict[str, Email] = {}
        self.clusters: List[Cluster] = []
        self.cluster_map: Dict[str, Cluster] = {}
        self.waves: List[List[Cluster]] = []
        self.built_wave_indices: Set[int] = set()
        self.excluded_personal_ids: List[str] = []
        self.left_out_singleton_ids: List[str] = []
        self.score = self.combo = self.max_combo = self.decisions_count = 0
        self.achievements: List[str] = []
        self.audit_log: List[AuditEntry] = []
        self.receipts: Dict[str, Receipt] = {}
        self.consumed_decision_ids: Set[str] = set()
        self.undone_decision_ids: Set[str] = set()
        self.warnings: List[str] = []
        self.wave_1_source: str = "heuristic"

    def touch(self) -> None:
        self.last_accessed = time.time()

    def is_expired(self) -> bool:
        return (time.time() - self.last_accessed) > settings.session_ttl_seconds

    def expires_at(self) -> str:
        return datetime.fromtimestamp(self.last_accessed + settings.session_ttl_seconds, tz=timezone.utc).isoformat()

class SessionService:
    def __init__(self):
        self._active_sessions: Dict[str, SessionData] = {}
        self._expired_ids: Set[str] = set()
        self._global_lock = asyncio.Lock()

    async def create_session(self, session_id: str, emails: List[Email], clusters: List[Cluster], waves: List[List[Cluster]], excluded_personal_ids: List[str], left_out_singleton_ids: List[str], warnings: List[str], wave_1_source: str, owner_id: Optional[str] = None) -> SessionData:
        async with self._global_lock:
            clean_owner = owner_id or f"user_{uuid.uuid4().hex[:12]}"
            owner_tok = f"tok_{uuid.uuid4().hex}"
            sess = SessionData(session_id, clean_owner, owner_tok)
            sess.emails, sess.emails_map = emails, {e.id: e for e in emails}
            sess.clusters, sess.cluster_map = clusters, {c.cluster_id: c for c in clusters}
            sess.waves = waves
            if waves: sess.built_wave_indices.add(0)
            sess.excluded_personal_ids = excluded_personal_ids
            sess.left_out_singleton_ids = left_out_singleton_ids
            sess.warnings = warnings
            sess.wave_1_source = wave_1_source
            self._active_sessions[session_id] = sess
            return sess

    async def get_session(self, session_id: str, owner_token: Optional[str] = None) -> Optional[SessionData]:
        async with self._global_lock:
            s = self._active_sessions.get(session_id)
            if not s:
                return None
            if s.is_expired():
                del self._active_sessions[session_id]
                self._expired_ids.add(session_id)
                return None
            s.touch()
            return s

    async def delete_session(self, session_id: str, owner_token: Optional[str] = None) -> bool:
        async with self._global_lock:
            s = self._active_sessions.get(session_id)
            if not s:
                return False
            async with s.lock:
                del self._active_sessions[session_id]
                self._expired_ids.add(session_id)
                return True

    async def is_known_expired(self, session_id: str) -> bool:
        return session_id in self._expired_ids

session_store = SessionService()
