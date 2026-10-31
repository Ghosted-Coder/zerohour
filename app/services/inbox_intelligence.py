import re
from typing import List, Dict, Any
from app.models import SenderCluster, InboxAnalysisSummary

def classify_email_heuristic(sender: str, subject: str, snippet: str, list_unsub: bool) -> tuple[str, float]:
    combined = f"{sender} {subject} {snippet}".lower()
    
    # Financial/Transactional (Protected)
    if any(k in combined for k in ["invoice", "statement", "receipt", "order confirmation", "payment", "bank", "security code", "otp", "billing"]):
        return ("finance", 0.95)
    
    # Personal / Direct Work
    if any(k in combined for k in ["re:", "fwd:", "meeting", "resume", "interview", "invitation", "agenda"]):
        return ("work", 0.85)

    # Social Notifications
    if any(k in combined for k in ["linkedin", "twitter", "facebook", "instagram", "tiktok", "friend request", "connection", "tagged"]):
        return ("social", 0.90)

    # Newsletters
    if list_unsub or any(k in combined for k in ["newsletter", "digest", "weekly", "daily", "bulletin", "substack", "medium"]):
        return ("newsletter", 0.92)

    # Promotions / Marketing Clutter
    if any(k in combined for k in ["sale", "discount", "% off", "deals", "coupon", "exclusive offer", "limited time", "free shipping", "clearance"]):
        return ("promotions", 0.94)

    return ("promotions" if list_unsub else "personal", 0.70)

def cluster_and_analyze_messages(raw_messages: List[Dict[str, Any]]) -> InboxAnalysisSummary:
    clusters: Dict[str, Dict[str, Any]] = {}

    for msg in raw_messages:
        sender_raw = msg.get("from", "unknown@sender.com")
        subject = msg.get("subject", "(No Subject)")
        snippet = msg.get("snippet", "")
        unsub_link = msg.get("list_unsubscribe")
        msg_id = msg.get("id")

        # Extract email address
        match = re.search(r'<([^>]+)>', sender_raw)
        sender_email = match.group(1).lower() if match else sender_raw.strip().lower()
        sender_name = re.sub(r'<[^>]+>', '', sender_raw).strip().strip('"') or sender_email.split('@')[0]

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
        clusters[sender_email]["message_ids"].append(msg_id)
        if len(clusters[sender_email]["sample_subjects"]) < 3:
            clusters[sender_email]["sample_subjects"].append(subject)
        
        cat, conf = classify_email_heuristic(sender_raw, subject, snippet, bool(unsub_link))
        clusters[sender_email]["categories"].append((cat, conf))

    # Build ranked clusters
    ranked_clusters: List[SenderCluster] = []
    total_clutter_messages = 0

    for email, data in clusters.items():
        # Determine consensus category
        cats = [c[0] for c in data["categories"]]
        top_cat = max(set(cats), key=cats.count)
        avg_conf = sum(c[1] for c in data["categories"]) / len(data["categories"])

        # Clutter score computation
        count = data["email_count"]
        is_promo = top_cat in ["promotions", "newsletter", "social"]
        clutter_score = min(100.0, (count * 15.0) if is_promo else (count * 2.0))

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

    # Sort descending by clutter score
    ranked_clusters.sort(key=lambda x: x.clutter_score, reverse=True)

    total_scanned = len(raw_messages)
    clutter_ratio = round((total_clutter_messages / total_scanned), 2) if total_scanned > 0 else 0.0

    return InboxAnalysisSummary(
        total_messages_scanned=total_scanned,
        clutter_messages_count=total_clutter_messages,
        total_clusters=len(ranked_clusters),
        top_senders=ranked_clusters[:15],
        clutter_ratio=clutter_ratio
    )
