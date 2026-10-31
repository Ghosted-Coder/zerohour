from collections import Counter
from fastapi import APIRouter, HTTPException
from app.core.models import Action, EmailState
from app.storage.session_store import session_store

router = APIRouter(prefix="/api/sessions", tags=["report"])

@router.get("/{session_id}/receipt")
async def get_cumulative_receipt(session_id: str):
    sess = await session_store.get_session(session_id)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Not found."}})
    async with sess.lock:
        return {
            "session_id": session_id, "total_decisions": len(sess.receipts),
            "archived_in_session": sum(r.archived_in_session for r in sess.receipts.values()),
            "trashed_in_session": sum(r.trashed_in_session for r in sess.receipts.values()),
            "kept": sum(r.kept for r in sess.receipts.values()),
            "protected_untouched": sum(r.protected_untouched for r in sess.receipts.values()),
            "unsubscribe_links_exported": sum(r.unsubscribe_links_exported for r in sess.receipts.values()),
            "receipts": [r.model_dump() for r in sess.receipts.values()]
        }

@router.get("/{session_id}/report")
async def get_report(session_id: str):
    sess = await session_store.get_session(session_id)
    if not sess: raise HTTPException(404, detail={"error": {"code": "session_not_found", "message": "Not found."}})
    async with sess.lock:
        analyzed = len(sess.emails)
        proc = sum(1 for em in sess.emails if em.state in (EmailState.ARCHIVED, EmailState.TRASHED))
        kept = sum(c.count for c in sess.clusters if c.status == "decided" and c.decision and c.decision.action == Action.KEEP)
        undecided = sum(c.count for c in sess.clusters if c.status != "decided")
        ex_p, ex_s = len(sess.excluded_personal_ids), len(sess.left_out_singleton_ids)

        distinct_unsub = set()
        for c in sess.clusters:
            if c.status == "decided" and c.decision and c.decision.action == Action.UNSUBSCRIBE:
                if not c.unsubscribe_targets:
                    msg = f"An unsubscribe decision on sender '{c.sender_address}' with no List-Unsubscribe header counts 0 and adds a warning."
                    if msg not in sess.warnings: sess.warnings.append(msg)
                else:
                    for t in c.unsubscribe_targets: distinct_unsub.add(t)

        per_action, per_cat = Counter(), Counter()
        for c in sess.clusters:
            if c.status == "decided" and c.decision:
                per_action[c.decision.action.value] += c.count
                per_cat[c.category.value if c.category else "other"] += c.count

        return {
            "headline": {
                "emails_analyzed": analyzed, "decisions_made": sess.decisions_count,
                "processed_in_session": proc, "reviewed_kept": kept, "undecided": undecided,
                "excluded_personal": ex_p, "left_out_singletons": ex_s, "left_untouched": analyzed - proc,
                "protected_untouched": sum(c.count for c in sess.clusters if c.protected and (c.status != "decided" or (c.decision and c.decision.action == Action.KEEP))),
                "protected_processed": sum(c.count for c in sess.clusters if c.protected and c.status == "decided" and c.decision and c.decision.action in (Action.ARCHIVE, Action.TRASH, Action.UNSUBSCRIBE)),
                "unsubscribe_links_exported": len(distinct_unsub),
                "estimated_minutes_saved": round(proc * 5 / 60, 1),
                "assumption": "Assumes average review time of 5 seconds per email."
            },
            "per_action": dict(per_action), "per_category": dict(per_cat), "score": sess.score, "max_combo": sess.max_combo,
            "warnings": sess.warnings, "waves": {"built": len(sess.built_wave_indices), "completed": sum(1 for w in sess.waves if all(c.status == "decided" for c in w)), "total": len(sess.waves)}
        }
