from typing import List, Optional, Tuple
from app.core.models import Action, Cluster

ACHIEVEMENTS_ALL = {
    "first_decision", "combo_5", "boss_slayer", "protector", "inbox_under_10_percent",
}

def calculate_decision_points(
    cluster: Cluster,
    action: Action,
    combo_before: int,
    response_ms: Optional[int],
) -> Tuple[int, int]:
    base = 10 + min(cluster.count, 300) // 10

    if cluster.is_boss:
        speed = 1.0
        next_combo = combo_before
    elif response_ms is None:
        speed = 1.0
        next_combo = combo_before + 1
    else:
        speed = 1.25 if response_ms < 2500 else 1.0
        next_combo = combo_before + 1 if response_ms <= 4000 else 0

    boss_mult = 2.0 if cluster.is_boss else 1.0
    combo_mult = 1.0 + 0.1 * min(combo_before, 10)
    protection_bonus = 30 if cluster.protected and action in (Action.KEEP, Action.ARCHIVE) else 0

    raw_points = (base * combo_mult * speed * boss_mult) + protection_bonus
    return round(raw_points), next_combo

def check_new_achievements(
    current_achievements: List[str],
    decisions_count: int,
    current_combo: int,
    cluster: Cluster,
    action: Action,
    inbox_remaining: int,
    total_emails: int,
) -> List[str]:
    unlocked = set(current_achievements)
    new_unlocked: List[str] = []

    def award(name: str):
        if name not in unlocked:
            unlocked.add(name)
            new_unlocked.append(name)

    if decisions_count >= 1:
        award("first_decision")
    if current_combo >= 5:
        award("combo_5")
    if cluster.is_boss:
        award("boss_slayer")
    if cluster.protected and action in (Action.KEEP, Action.ARCHIVE):
        award("protector")
    if total_emails > 0 and (inbox_remaining / total_emails) < 0.10:
        award("inbox_under_10_percent")

    return new_unlocked
