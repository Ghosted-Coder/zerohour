import csv, hashlib, io
from datetime import datetime, timezone
from typing import List, Tuple
from app.config import settings
from app.core.models import Email, EmailState
from app.core.normalize import is_protected_text, normalize_subject_template, parse_sender

def parse_csv_bytes(csv_bytes: bytes) -> Tuple[List[Email], List[str]]:
    if len(csv_bytes) > settings.max_upload_bytes:
        raise ValueError("Upload exceeds maximum allowed size of 50 MB.")
    warnings, emails = [], []
    reader = csv.DictReader(io.StringIO(csv_bytes.decode("utf-8", errors="replace")))

    for idx, row in enumerate(reader):
        if len(emails) >= settings.max_emails_per_session:
            warnings.append("CSV reached 10,000 emails limit and was truncated.")
            break
        sender_raw = row.get("sender") or row.get("from") or "Unknown <unknown@unknown.local>"
        subject = row.get("subject", "").strip()
        date_str = row.get("date", "").strip()
        sender_name, sender_address, sender_domain = parse_sender(sender_raw)
        try:
            date_dt = datetime.fromisoformat(date_str) if date_str else datetime.now(timezone.utc)
            if date_dt.tzinfo is None:
                date_dt = date_dt.replace(tzinfo=timezone.utc)
        except Exception:
            date_dt = datetime.now(timezone.utc)

        snippet = (row.get("snippet") or "")[:200].strip()
        unread_val = str(row.get("unread", "true")).lower() in ("true", "1", "yes")
        unsub_val = row.get("unsubscribe") or None
        id_salt = f"{idx}:{sender_address}:{subject}:{date_dt.isoformat()}"
        sha_sig = hashlib.sha256(id_salt.encode("utf-8")).hexdigest()[:12]

        emails.append(Email(
            id=f"csv_{idx}_{sha_sig}", sender_name=sender_name, sender_address=sender_address, sender_domain=sender_domain,
            subject=subject, subject_template=normalize_subject_template(subject), date=date_dt, snippet=snippet,
            unread=unread_val, has_unsubscribe=bool(unsub_val), unsubscribe_target=unsub_val,
            protected_flag=is_protected_text(subject, snippet), state=EmailState.INBOX
        ))
    return emails, warnings
