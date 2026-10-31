import logging
from datetime import datetime, timezone
from typing import Dict, List, Set, Tuple, Union
from app.core.game import calculate_decision_points, check_new_achievements
from app.core.models import (
    Action, AuditEntry, Cluster, DecisionRecord, Email, EmailState, ExecutionStatus, Receipt, SessionContext
)

logger = logging.getLogger("zerohour.executor")

class ExecutorError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code, self.message, self.status_code = code, message, status_code

def _ensure_session_context(context_or_dict: Union[SessionContext, dict]) -> SessionContext:
    if isinstance(context_or_dict, SessionContext):
        return context_or_dict
    if isinstance(context_or_dict, dict):
        try:
            return SessionContext.model_validate(context_or_dict)
        except Exception as e:
            raise ExecutorError("invalid_session_context", f"Validation error: {e}", 400)
    raise ExecutorError("invalid_session_context", "context must be SessionContext or dict", 400)

def execute_decision(
    cluster: Cluster, action: Action, decision_id: str, response_ms: int | None,
    confirmed: bool, emails_map: Dict[str, Email], context: Union[SessionContext, dict]
) -> Tuple[dict, Receipt, bool]:
    ctx = _ensure_session_context(context)

    missing = [eid for eid in cluster.email_ids if eid not in emails_map]
    if missing:
        raise ExecutorError("missing_email_data", f"Missing email data: {missing}", 400)

    if decision_id in ctx.undone_decision_ids:
        raise ExecutorError("decision_id_already_consumed", "This decision_id was previously undone.", 409)

    if decision_id in ctx.receipts:
        rcpt = ctx.receipts[decision_id]
        inbox_rem = sum(1 for em in emails_map.values() if em.state == EmailState.INBOX)
        return {"items_affected": rcpt.items_processed or rcpt.kept, "points_awarded": 0, "combo": ctx.combo, "score": ctx.score, "inbox_remaining": inbox_rem, "achievements": [], "receipt": rcpt.model_dump()}, rcpt, True

    if cluster.status == "decided":
        raise ExecutorError("cluster_already_decided", f"Cluster '{cluster.cluster_id}' already decided.", 409)

    if cluster.protected and action in (Action.TRASH, Action.UNSUBSCRIBE) and not confirmed:
        raise ExecutorError("confirmation_required", "Protected cluster requires confirmation.", 400)

    affected_ids = list(cluster.email_ids)
    snaps = {eid: emails_map[eid].state for eid in affected_ids}
    old_score, old_combo, old_max_combo = ctx.score, ctx.combo, ctx.max_combo
    old_dec_cnt, old_achs = ctx.decisions_count, list(ctx.achievements)
    old_status, old_dec = cluster.status, cluster.decision
    old_rcpts_len, old_audit_len = set(ctx.receipts.keys()), len(ctx.audit_log)

    try:
        new_state = EmailState.ARCHIVED if action == Action.ARCHIVE else (EmailState.TRASHED if action in (Action.TRASH, Action.UNSUBSCRIBE) else EmailState.INBOX)
        for eid in affected_ids:
            emails_map[eid].state = new_state

        pts, next_combo = calculate_decision_points(cluster, action, old_combo, response_ms)
        ctx.score += pts
        ctx.combo = next_combo
        ctx.max_combo = max(old_max_combo, next_combo)
        ctx.decisions_count = old_dec_cnt + 1

        inbox_rem = sum(1 for em in emails_map.values() if em.state == EmailState.INBOX)
        new_achs = check_new_achievements(ctx.achievements, ctx.decisions_count, next_combo, cluster, action, inbox_rem, ctx.total_emails)
        ctx.achievements.extend(new_achs)

        cluster.status = "decided"
        cluster.decision = DecisionRecord(decision_id=decision_id, action=action, timestamp=datetime.now(timezone.utc), confirmed=confirmed)

        exec_st = ExecutionStatus.MANUAL_FOLLOWUP if action == Action.UNSUBSCRIBE else (ExecutionStatus.APPLIED_IN_SESSION if cluster.protected or action == Action.KEEP else ExecutionStatus.PENDING_GMAIL_IMPORT)
        rcpt = Receipt(
            cluster_id=cluster.cluster_id, decision_id=decision_id, timestamp=datetime.now(timezone.utc).isoformat(),
            items_processed=len(affected_ids) if action != Action.KEEP else 0,
            archived_in_session=len(affected_ids) if action == Action.ARCHIVE else 0,
            trashed_in_session=len(affected_ids) if action in (Action.TRASH, Action.UNSUBSCRIBE) else 0,
            kept=len(affected_ids) if action == Action.KEEP else 0,
            protected_untouched=len(affected_ids) if cluster.protected and action == Action.KEEP else 0,
            unsubscribe_links_exported=len(cluster.unsubscribe_targets) if action == Action.UNSUBSCRIBE else 0,
            execution_status=exec_st
        )

        audit_entry = AuditEntry(
            entry_id=f"audit_{decision_id}", decision_id=decision_id, cluster_id=cluster.cluster_id, action=action,
            timestamp=datetime.now(timezone.utc), is_reversal=False, items_affected=len(affected_ids),
            details={"points_awarded": pts, "combo": next_combo, "prev_score": old_score, "prev_combo": old_combo, "prev_max_combo": old_max_combo, "prev_decisions_count": old_dec_cnt, "prev_email_states": {eid: st.value for eid, st in snaps.items()}, "inbox_remaining": inbox_rem, "new_achievements": new_achs}
        )
        ctx.audit_log.append(audit_entry)
        ctx.receipts[decision_id] = rcpt
        ctx.consumed_decision_ids.add(decision_id)

        if isinstance(context, dict):
            ctx.sync_to_dict(context)

        return {"items_affected": len(affected_ids), "points_awarded": pts, "combo": next_combo, "score": ctx.score, "inbox_remaining": inbox_rem, "achievements": new_achs, "receipt": rcpt.model_dump()}, rcpt, False
    except Exception as e:
        logger.error("Decision transaction failed; rolling back atomically. cluster=%s err=%s", cluster.cluster_id, type(e).__name__)
        for eid, old_st in snaps.items():
            emails_map[eid].state = old_st
        ctx.score, ctx.combo, ctx.max_combo, ctx.decisions_count = old_score, old_combo, old_max_combo, old_dec_cnt
        ctx.achievements, cluster.status, cluster.decision = old_achs, old_status, old_dec
        ctx.audit_log = ctx.audit_log[:old_audit_len]
        for k in list(ctx.receipts.keys()):
            if k not in old_rcpts_len:
                del ctx.receipts[k]
        ctx.consumed_decision_ids.discard(decision_id)
        if isinstance(context, dict):
            ctx.sync_to_dict(context)
        raise

def undo_last_decision(decision_id: str, cluster: Cluster, emails_map: Dict[str, Email], context: Union[SessionContext, dict]) -> dict:
    ctx = _ensure_session_context(context)
    missing = [eid for eid in cluster.email_ids if eid not in emails_map]
    if missing:
        raise ExecutorError("missing_email_data", f"Missing email data: {missing}", 409)

    if decision_id in ctx.undone_decision_ids:
        inbox_rem = sum(1 for em in emails_map.values() if em.state == EmailState.INBOX)
        return {"duplicate": True, "restored_cluster_id": cluster.cluster_id, "decision_id": decision_id, "score": ctx.score, "combo": ctx.combo, "inbox_remaining": inbox_rem}

    reversed_ids = {e.decision_id for e in ctx.audit_log if e.is_reversal}
    last_applied = next((e for e in reversed(ctx.audit_log) if not e.is_reversal and e.decision_id not in reversed_ids), None)

    if not last_applied or last_applied.decision_id != decision_id:
        raise ExecutorError("not_last_decision", "Only the most recent active decision can be undone.", 409)
    if cluster.cluster_id != last_applied.cluster_id:
        raise ExecutorError("cluster_mismatch", "Cluster mismatch on undo.", 409)
    if not cluster.decision or cluster.decision.decision_id != decision_id or cluster.decision.action != last_applied.action:
        raise ExecutorError("action_mismatch", "Cluster action mismatch on undo.", 409)
    if decision_id not in ctx.receipts:
        raise ExecutorError("missing_receipt", "Active receipt not found on undo.", 409)

    prev_email_states = last_applied.details.get("prev_email_states", {})
    if any(eid not in prev_email_states for eid in cluster.email_ids):
        raise ExecutorError("missing_email_state", "Previous email state missing.", 409)

    snaps = {eid: emails_map[eid].state for eid in cluster.email_ids}
    pre_score, pre_combo, pre_max_combo = ctx.score, ctx.combo, ctx.max_combo
    pre_dec_cnt, pre_achs = ctx.decisions_count, list(ctx.achievements)
    pre_rcpt, pre_audit_len = ctx.receipts.get(decision_id), len(ctx.audit_log)

    try:
        for eid in cluster.email_ids:
            emails_map[eid].state = EmailState(prev_email_states[eid])
        ctx.score = last_applied.details["prev_score"]
        ctx.combo = last_applied.details["prev_combo"]
        ctx.max_combo = last_applied.details["prev_max_combo"]
        ctx.decisions_count = last_applied.details["prev_decisions_count"]
        for a in last_applied.details.get("new_achievements", []):
            if a in ctx.achievements: ctx.achievements.remove(a)

        cluster.status, cluster.decision = "open", None
        ctx.receipts.pop(decision_id, None)

        reversal = AuditEntry(
            entry_id=f"undo_{decision_id}_{datetime.now(timezone.utc).timestamp()}", decision_id=decision_id,
            cluster_id=cluster.cluster_id, action=last_applied.action, timestamp=datetime.now(timezone.utc),
            is_reversal=True, items_affected=len(cluster.email_ids), details={"reverted_points": last_applied.details.get("points_awarded", 0)}
        )
        ctx.audit_log.append(reversal)
        ctx.undone_decision_ids.add(decision_id)

        if isinstance(context, dict):
            ctx.sync_to_dict(context)

        inbox_rem = sum(1 for em in emails_map.values() if em.state == EmailState.INBOX)
        return {"duplicate": False, "restored_cluster_id": cluster.cluster_id, "decision_id": decision_id, "score": ctx.score, "combo": ctx.combo, "inbox_remaining": inbox_rem}
    except Exception as e:
        logger.error("Undo transaction failed; rolling back undo snapshot. err=%s", type(e).__name__)
        for eid, old_st in snaps.items():
            emails_map[eid].state = old_st
        ctx.score, ctx.combo, ctx.max_combo, ctx.decisions_count = pre_score, pre_combo, pre_max_combo, pre_dec_cnt
        ctx.achievements, cluster.status = pre_achs, "decided"
        if pre_rcpt: ctx.receipts[decision_id] = pre_rcpt
        ctx.audit_log = ctx.audit_log[:pre_audit_len]
        ctx.undone_decision_ids.discard(decision_id)
        if isinstance(context, dict): ctx.sync_to_dict(context)
        raise
