import re
from datetime import datetime, timezone
from typing import List
from pydantic import BaseModel, Field

NICKNAME_PATTERN = re.compile(r"^[a-zA-Z0-9 _-]{3,16}$")

class LeaderboardEntry(BaseModel):
    nickname: str
    score: int
    max_combo: int
    decisions_count: int
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class LeaderboardStore:
    def __init__(self):
        self._memory = []

    async def submit_score(self, nickname: str, score: int, max_combo: int, decisions_count: int) -> LeaderboardEntry:
        clean = nickname.strip()
        if not NICKNAME_PATTERN.match(clean):
            raise ValueError("Nickname must be 3-16 alphanumeric characters.")
        entry = LeaderboardEntry(nickname=clean, score=score, max_combo=max_combo, decisions_count=decisions_count)
        self._memory.append(entry)
        return entry

    async def get_top_entries(self, limit: int = 10) -> List[LeaderboardEntry]:
        return sorted(self._memory, key=lambda x: -x.score)[:limit]

leaderboard_store = LeaderboardStore()
