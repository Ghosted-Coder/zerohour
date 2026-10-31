from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from app.storage.leaderboard import LeaderboardEntry, leaderboard_store
from app.storage.session_store import session_store

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

class LeaderboardSubmitRequest(BaseModel):
    session_id: str
    nickname: str = Field(..., min_length=3, max_length=16)

@router.get("", response_model=List[LeaderboardEntry])
async def get_leaderboard():
    return await leaderboard_store.get_top_entries(limit=10)

@router.post("", response_model=LeaderboardEntry)
async def submit_leaderboard_score(req: LeaderboardSubmitRequest):
    sess = await session_store.get_session(req.session_id)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Session not found."}})
    async with sess.lock:
        if sess.decisions_count < 1:
            raise HTTPException(400, detail={"error": {"code": "invalid_request", "message": "Make at least one decision."}})
        try:
            return await leaderboard_store.submit_score(req.nickname, sess.score, sess.max_combo, sess.decisions_count)
        except ValueError as ve:
            raise HTTPException(400, detail={"error": {"code": "invalid_request", "message": str(ve)}})
