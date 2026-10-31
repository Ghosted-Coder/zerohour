from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from app.core.decide.gemini import decide_wave
from app.core.models import CardView, Cluster
from app.storage.session_store import session_store

router = APIRouter(prefix="/api/sessions", tags=["deck"])

def _interleave_bosses(clusters: List[Cluster]) -> List[Cluster]:
    bosses = [c for c in clusters if c.is_boss]
    regulars = [c for c in clusters if not c.is_boss]
    total_len = len(clusters)
    result: List[Optional[Cluster]] = [None] * total_len

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

@router.get("/{session_id}/deck")
async def get_deck(session_id: str, wave: int = Query(1, ge=1)):
    sess = await session_store.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail={"error": {"code": "session_not_found", "message": "Session not found."}})

    async with sess.lock:
        wave_idx = wave - 1
        if wave_idx < 0 or wave_idx >= len(sess.waves):
            raise HTTPException(status_code=400, detail={"error": {"code": "invalid_request", "message": f"Wave {wave} out of range."}})

        if wave_idx not in sess.built_wave_indices:
            target = sess.waves[wave_idx]
            await decide_wave(target)
            sess.waves[wave_idx] = _interleave_bosses(target)
            sess.built_wave_indices.add(wave_idx)

        cards = [
            CardView(
                cluster_id=c.cluster_id, sender_name=c.sender_name, sender_address=c.sender_address,
                count=c.count, unread_count=c.unread_count, sample_subjects=c.sample_subjects,
                date_range=c.date_range, category=c.category, suggested_action=c.suggested_action,
                confidence=c.confidence, reason=c.reason, decision_source=c.decision_source,
                is_boss=c.is_boss, protected=c.protected, status=c.status, decision=c.decision
            )
            for c in sess.waves[wave_idx]
        ]
        return {"wave": wave, "total_waves": len(sess.waves), "cards": cards}
