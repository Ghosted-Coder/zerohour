import re
from typing import Tuple
from app.core.models import Action, Category, Cluster

NEWSLETTER_TERMS = re.compile(r"\b(newsletter|weekly|digest|roundup|edition|issue|curated)\b", re.IGNORECASE)
PROMO_TERMS = re.compile(r"\b(discount|off|deal|sale|promo|save|coupon|offer|clearance)\b", re.IGNORECASE)
RECEIPT_TERMS = re.compile(r"\b(receipt|invoice|order|purchased|payment|billing|total|charged)\b", re.IGNORECASE)
SECURITY_TERMS = re.compile(r"\b(security|password|verification|code|otp|sign-in|unauthorized)\b", re.IGNORECASE)
SOCIAL_TERMS = re.compile(r"\b(invitation|connect|friend|follower|replied|mentioned)\b", re.IGNORECASE)

def evaluate_heuristic(cluster: Cluster) -> Tuple[Category, Action, float, str]:
    combined = " ".join(cluster.sample_subjects + [cluster.sample_snippet]).lower()
    if cluster.protected or SECURITY_TERMS.search(combined):
        return (Category.SECURITY, Action.KEEP, 0.95, "Security or verification alerts require careful review")
    if RECEIPT_TERMS.search(combined):
        return (Category.RECEIPT, Action.KEEP, 0.90, "Purchase confirmations and financial invoices")
    if PROMO_TERMS.search(combined) or cluster.role_hint in ("marketing", "updates"):
        return (Category.PROMOTION, Action.ARCHIVE, 0.80, "Promotional offers and commercial discounts")
    if NEWSLETTER_TERMS.search(combined) or cluster.has_unsubscribe:
        return (Category.NEWSLETTER, Action.ARCHIVE, 0.75, "Periodic newsletter or subscription broadcast")
    if SOCIAL_TERMS.search(combined):
        return (Category.SOCIAL, Action.ARCHIVE, 0.70, "Social network updates and notification feed")
    return (Category.OTHER, Action.KEEP, 0.50, "Unclassified email cluster; default to keep")
