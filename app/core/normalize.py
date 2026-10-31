import email.utils
import re
from typing import Tuple

ROLE_HINTS = {
    "noreply", "no-reply", "support", "billing", "alerts", "notifications",
    "newsletter", "news", "info", "orders", "security", "hello", "team",
    "updates", "marketing", "receipts", "accounts", "careers", "jobs",
}

FREEMAIL_DOMAINS = {
    "gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com",
    "live.com", "mail.com", "aol.com", "proton.me", "protonmail.com",
}

PROTECTED_PATTERN = re.compile(
    r"\b(verification\s*code|otp|one[-\s]time\s*password|password\s*reset|"
    r"security\s*alert|sign[-\s]in\s*attempt|suspicious\s*activity|"
    r"invoice|receipt|order\s*confirmation|payment\s*received|payment\s*due|"
    r"statement|tax\s*form|bank|wire\s*transfer|billing\s*summary|"
    r"e-receipt|purchase\s*confirmation)\b",
    re.IGNORECASE,
)

def parse_sender(raw_from: str) -> Tuple[str, str, str]:
    if not raw_from:
        return "Unknown", "unknown@unknown.local", "unknown.local"
    realname, email_addr = email.utils.parseaddr(raw_from)
    email_addr = email_addr.strip().lower()
    if not email_addr or "@" not in email_addr:
        email_addr = "unknown@unknown.local"
    sender_domain = email_addr.split("@")[-1].strip().lower()
    sender_name = realname.strip() if realname else email_addr.split("@")[0]
    return sender_name, email_addr, sender_domain

def extract_role_hint(sender_address: str) -> str | None:
    if "@" not in sender_address:
        return None
    local_part = sender_address.split("@")[0].lower()
    clean_local = re.sub(r"[._\-+].*$", "", local_part)
    if local_part in ROLE_HINTS:
        return local_part
    if clean_local in ROLE_HINTS:
        return clean_local
    return None

def normalize_subject_template(subject: str) -> str:
    if not subject:
        return ""
    s = subject.lower().strip()
    s = re.sub(r"\[.*?\]|\(.*?\)", " ", s)
    s = re.sub(r"\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b", " ", s)
    s = re.sub(r"https?://\S+|www\.\S+", " ", s)
    s = re.sub(r"\b[0-9a-f]{8,}\b", " ", s)
    s = re.sub(r"\b[0-9a-z_-]{16,}\b", " ", s)
    s = re.sub(r"\d+", "#", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def is_protected_text(subject: str, snippet: str) -> bool:
    combined = f"{subject} {snippet}"
    return bool(PROTECTED_PATTERN.search(combined))

def is_personal_candidate(sender_address: str, has_unsubscribe: bool, sender_total_count: int) -> bool:
    domain = sender_address.split("@")[-1].lower() if "@" in sender_address else ""
    return domain in FREEMAIL_DOMAINS and not has_unsubscribe and sender_total_count <= 5
