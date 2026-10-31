import uuid
from typing import Optional
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from app.core.executor import ExecutorError, execute_decision, undo_last_decision
from app.core.models import Action, SessionContext
from app.storage.session_store import session_store

router = APIRouter(prefix="/api/sessions", tags=["decisions"])

class DecisionRequest(BaseModel):
    decision_id: str = Field(...)
    cluster_id: str
    action: Action
    response_ms: Optional[int] = None
    confirmed: Optional[bool] = False

    @field_validator("decision_id")
    @classmethod
    def val_uuid(cls, v: str) -> str:
        return str(uuid.UUID(str(v).strip())).lower()

class UndoRequest(BaseModel):
    decision_id: str = Field(...)

    @field_validator("decision_id")
    @classmethod
    def val_uuid(cls, v: str) -> str:
        return str(uuid.UUID(str(v).strip())).lower()

@router.post("/{session_id}/decisions")
async def post_decision(session_id: str, req: DecisionRequest, x_owner_token: Optional[str] = Header(None, alias="X-Owner-Token")):
    sess = await session_store.get_session(session_id, owner_token=x_owner_token)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Not found."}})

    async with sess.lock:
        cluster = sess.cluster_map.get(req.cluster_id)
        if not cluster: raise HTTPException(404, detail={"error": {"code": "cluster_not_found", "message": "Not found."}})

        w_idx = next((i for i, w in enumerate(sess.waves) if any(c.cluster_id == cluster.cluster_id for c in w)), None)
        if w_idx is None or w_idx not in sess.built_wave_indices:
            raise HTTPException(409, detail={"error": {"code": "wave_not_loaded", "message": "Wave not loaded."}})

        context = SessionContext.from_session_data(sess)
        try:
            result, rcpt, is_dup = execute_decision(cluster, req.action, req.decision_id, req.response_ms, bool(req.confirmed), sess.emails_map, context)
            context.sync_to_session_data(sess)
            return {"duplicate": is_dup, "requires_confirmation": False, "result": result}
        except ExecutorError as ee:
            if ee.code == "confirmation_required": return {"duplicate": False, "requires_confirmation": True, "warning": ee.message}
            raise HTTPException(ee.status_code, detail={"error": {"code": ee.code, "message": ee.message}})

@router.post("/{session_id}/undo")
async def post_undo(session_id: str, req: UndoRequest, x_owner_token: Optional[str] = Header(None, alias="X-Owner-Token")):
    sess = await session_store.get_session(session_id, owner_token=x_owner_token)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Not found."}})

    async with sess.lock:
        target = next((c for c in sess.clusters if c.decision and c.decision.decision_id == req.decision_id), None)
        if not target and req.decision_id in sess.undone_decision_ids:
            cid = next((e.cluster_id for e in sess.audit_log if e.decision_id == req.decision_id), None)
            target = sess.cluster_map.get(cid)
        if not target: raise HTTPException(409, detail={"error": {"code": "not_last_decision", "message": "Not active."}})

        context = SessionContext.from_session_data(sess)
        try:
            undo_res = undo_last_decision(req.decision_id, target, sess.emails_map, context)
            context.sync_to_session_data(sess)
            return undo_res
        except ExecutorError as ee:
            raise HTTPException(ee.status_code, detail={"error": {"code": ee.code, "message": ee.message}})
