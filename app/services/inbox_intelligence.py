import re
import time
from typing import List, Dict, Any, Tuple
from app.models import SenderCluster, InboxAnalysisSummary
from app.security import sanitize_input_text

# High-efficiency pre-compiled regular expressions
RE_EMAIL = re.compile(r'<([^>]+)>')
RE_STRIP_EMAIL = re.compile(r'<[^>]+>')
RE_FINANCE = re.compile(r'(invoice|statement|receipt|order confirmation|payment|bank|security code|otp|billing|salary|payroll|chase|wells fargo)', re.IGNORECASE)
RE_WORK = re.compile(r'(re:|fwd:|meeting|resume|interview|invitation|agenda|client|contract)', re.IGNORECASE)
RE_SOCIAL = re.compile(r'(linkedin|twitter|facebook|instagram|tiktok|friend request|connection|tagged)', re.IGNORECASE)
RE_NEWSLETTER = re.compile(r'(newsletter|digest|weekly|daily|bulletin|substack|medium|beehiiv)', re.IGNORECASE)
RE_PROMO = re.compile(r'(sale|discount|% off|deals|coupon|exclusive offer|limited time|free shipping|clearance|promo)', re.IGNORECASE)

# In-memory intelligence cache with 5-minute TTL to prevent redundant Gmail parsing
INTELLIGENCE_CACHE: Dict[str, Tuple[InboxAnalysisSummary, float]] = {}

def classify_email_heuristic(sender: str, subject: str, snippet: str, list_unsub: bool) -> Tuple[str, float]:
    combined = f"{sender} {subject} {snippet}"
    
    # Financial / Transactional (Strictly Shielded)
    if RE_FINANCE.search(combined):
        return ("finance", 0.99)
    
    # Personal / Direct Work (Strictly Shielded)
    if RE_WORK.search(combined):
        return ("work", 0.95)

    # Social Notifications
    if RE_SOCIAL.search(combined):
        return ("social", 0.92)

    # Promotions & Marketing Clutter
    if RE_PROMO.search(combined):
        return ("promotions", 0.96)

    # Newsletters
    if list_unsub or RE_NEWSLETTER.search(combined):
        return ("newsletter", 0.94)

    return ("promotions" if list_unsub else "personal", 0.75)

def cluster_and_analyze_messages(raw_messages: List[Dict[str, Any]], cache_key: str = None) -> InboxAnalysisSummary:
    now = time.time()
    if cache_key and cache_key in INTELLIGENCE_CACHE:
        cached_result, cached_time = INTELLIGENCE_CACHE[cache_key]
        if now - cached_time < 300: # 5 min TTL
            return cached_result

    clusters: Dict[str, Dict[str, Any]] = {}

    for msg in raw_messages:
        sender_raw = str(msg.get("from", "unknown@sender.com"))
        subject = sanitize_input_text(msg.get("subject", "(No Subject)"), 120)
        snippet = sanitize_input_text(msg.get("snippet", ""), 160)
        unsub_link = msg.get("list_unsubscribe")
        msg_id = msg.get("id")

        match = RE_EMAIL.search(sender_raw)
        sender_email = sanitize_input_text(
            match.group(1).lower() if match else sender_raw.strip().lower(),
            120
        )
        sender_name = sanitize_input_text(
            RE_STRIP_EMAIL.sub('', sender_raw).strip().strip('"') or sender_email.split('@')[0],
            90
        )

        if sender_email not in clusters:
            clusters[sender_email] = {
                "sender_email": sender_email,
                "sender_name": sender_name,
                "email_count": 0,
                "latest_date": msg.get("date", ""),
                "sample_subjects": [],
                "unsub_link": unsub_link,
                "message_ids": [],
                "categories": []
            }

        clusters[sender_email]["email_count"] += 1
        if msg_id:
            clusters[sender_email]["message_ids"].append(msg_id)
        if len(clusters[sender_email]["sample_subjects"]) < 3:
            clusters[sender_email]["sample_subjects"].append(subject)
        
        cat, conf = classify_email_heuristic(sender_raw, subject, snippet, bool(unsub_link))
        clusters[sender_email]["categories"].append((cat, conf))

    ranked_clusters: List[SenderCluster] = []
    total_clutter_messages = 0

    for email, data in clusters.items():
        cats = [c[0] for c in data["categories"]]
        top_cat = max(set(cats), key=cats.count)
        avg_conf = sum(c[1] for c in data["categories"]) / len(data["categories"])

        count = data["email_count"]
        is_promo = top_cat in ["promotions", "newsletter", "social"]
        clutter_score = min(100.0, (count * 15.0) if is_promo else (count * 1.5))

        if is_promo:
            total_clutter_messages += count
            rec_action = "Unsubscribe + Bulk Archive" if data["unsub_link"] else "Bulk Archive + Gmail Filter"
        else:
            rec_action = "Keep in Inbox"

        ranked_clusters.append(SenderCluster(
            sender_email=email,
            sender_name=data["sender_name"],
            email_count=count,
            latest_date=data["latest_date"],
            sample_subjects=data["sample_subjects"],
            category=top_cat,
            confidence=round(avg_conf, 2),
            clutter_score=round(clutter_score, 1),
            recommended_action=rec_action,
            opt_out_link=data["unsub_link"],
            message_ids=data["message_ids"]
        ))

    ranked_clusters.sort(key=lambda x: x.clutter_score, reverse=True)
    total_scanned = len(raw_messages)
    clutter_ratio = round((total_clutter_messages / total_scanned), 2) if total_scanned > 0 else 0.0

    summary = InboxAnalysisSummary(
        total_messages_scanned=total_scanned,
        clutter_messages_count=total_clutter_messages,
        total_clusters=len(ranked_clusters),
        top_senders=ranked_clusters[:15],
        clutter_ratio=clutter_ratio
    )

    if cache_key:
        INTELLIGENCE_CACHE[cache_key] = (summary, now)

    return summary
