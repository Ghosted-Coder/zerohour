import uuid
from typing import List, Optional
from fastapi import APIRouter, Header, HTTPException, Request, status
from app.config import settings
from app.core.cluster import cluster_emails, partition_into_waves
from app.core.decide.gemini import decide_wave
from app.core.ingest.csv_ingest import parse_csv_bytes
from app.core.ingest.demo import generate_demo_inbox
from app.core.ingest.mbox import parse_mbox_stream
from app.core.models import Cluster, DecisionSource, Email, EmailState
from app.storage.session_store import session_store

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

def _interleave_bosses_list(clusters: List[Cluster]) -> List[Cluster]:
    bosses = [c for c in clusters if c.is_boss]
    regulars = [c for c in clusters if not c.is_boss]
    total_len = len(clusters)
    result = [None] * total_len

    boss_idx = 0
    for slot in range(4, total_len, 5):
        if boss_idx < len(bosses):
            result[slot] = bosses[boss_idx]
            boss_idx += 1

    fill_pool = regulars + bosses[boss_idx:]
    fill_idx = 0
    for i in range(total_len):
        if result[i] is None and fill_idx < len(fill_pool):
            result[i] = fill_pool[fill_idx]
            fill_idx += 1

    return [c for c in result if c is not None]

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(request: Request, x_user_id: Optional[str] = Header(None, alias="X-User-ID")):
    source = "demo"
    file_bytes, filename = None, ""
    ctype = request.headers.get("content-type", "")

    if "multipart/form-data" in ctype:
        form = await request.form()
        source = str(form.get("source", "demo"))
        up = form.get("file")
        if up and hasattr(up, "read"):
            filename = getattr(up, "filename", "") or ""
            file_bytes = await up.read()
    elif "application/json" in ctype:
        try:
            b = await request.json()
            source = b.get("source", "demo")
        except Exception:
            source = "demo"
    else:
        source = request.query_params.get("source", "demo")

    session_id = str(uuid.uuid4())
    emails, warnings = [], []

    try:
        if source == "demo":
            emails, warnings = generate_demo_inbox()
        elif source == "csv":
            if not file_bytes: raise HTTPException(400, detail={"error": {"code": "invalid_request", "message": "CSV upload required."}})
            emails, warnings = parse_csv_bytes(file_bytes)
        elif source == "mbox":
            if not file_bytes: raise HTTPException(400, detail={"error": {"code": "invalid_request", "message": "Mbox upload required."}})
            async def chunk_gen():
                for i in range(0, len(file_bytes), 64 * 1024): yield file_bytes[i : i + 64 * 1024]
            emails, warnings = await parse_mbox_stream(chunk_gen(), len(file_bytes))
        else:
            raise HTTPException(400, detail={"error": {"code": "invalid_request", "message": f"Unsupported: {source}"}})
    except ValueError as ve:
        raise HTTPException(413, detail={"error": {"code": "file_too_large", "message": str(ve)}})

    if not emails:
        raise HTTPException(400, detail={"error": {"code": "invalid_request", "message": "No valid emails."}})

    deck, excluded, singletons = await cluster_emails(emails)
    waves = partition_into_waves(deck, wave_size=60)
    w1_src = "heuristic"

    if waves:
        await decide_wave(waves[0])
        waves[0] = _interleave_bosses_list(waves[0])
        srcs = {c.decision_source for c in waves[0] if c.decision_source}
        w1_src = "mixed" if DecisionSource.GEMINI in srcs and DecisionSource.HEURISTIC in srcs else ("gemini" if DecisionSource.GEMINI in srcs else "heuristic")

    sess = await session_store.create_session(session_id, emails, deck, waves, excluded, singletons, warnings, w1_src, x_user_id)
    return {
        "session_id": session_id, "owner_id": sess.owner_id, "owner_token": sess.owner_token,
        "status": "ready", "expires_at": sess.expires_at(),
        "stats": {"total_emails": len(emails), "excluded_personal": len(excluded), "left_out_singletons": len(singletons), "clusters": len(deck), "total_waves": len(waves)},
        "decision_source": w1_src, "warnings": sess.warnings,
    }

@router.get("/{session_id}")
async def get_session(session_id: str, x_owner_token: Optional[str] = Header(None, alias="X-Owner-Token")):
    sess = await session_store.get_session(session_id, owner_token=x_owner_token)
    if not sess:
        if await session_store.is_known_expired(session_id):
            raise HTTPException(410, detail={"error": {"code": "session_expired", "message": "Expired."}})
        raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Not found."}})

    async with sess.lock:
        inbox_rem = sum(1 for em in sess.emails if em.state == EmailState.INBOX)
        return {
            "status": "active", "owner_id": sess.owner_id, "version": sess.version, "expires_at": sess.expires_at(),
            "stats": {"total_emails": len(sess.emails), "inbox_remaining": inbox_rem, "items_cleared": len(sess.emails) - inbox_rem, "clusters_total": len(sess.clusters), "clusters_done": sum(1 for c in sess.clusters if c.status == "decided"), "score": sess.score, "combo": sess.combo, "max_combo": sess.max_combo}
        }

@router.delete("/{session_id}")
async def delete_session(session_id: str, x_owner_token: Optional[str] = Header(None, alias="X-Owner-Token")):
    if not await session_store.delete_session(session_id, owner_token=x_owner_token):
        raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Not found."}})
    return {"status": "deleted"}
