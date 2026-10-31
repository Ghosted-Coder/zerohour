import email, email.policy, hashlib, html, re
from datetime import datetime, timezone
from typing import AsyncGenerator, List, Tuple
from app.config import settings
from app.core.models import Email, EmailState
from app.core.normalize import is_protected_text, normalize_subject_template, parse_sender

def _strip_html(html_str: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html_str)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()

def _extract_snippet_from_msg(msg: email.message.EmailMessage) -> str:
    body_text = ""
    try:
        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                if ctype == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload:
                        charset = part.get_content_charset() or "utf-8"
                        body_text = payload.decode(charset, errors="replace")
                        break
            if not body_text:
                for part in msg.walk():
                    if part.get_content_type() == "text/html":
                        payload = part.get_payload(decode=True)
                        if payload:
                            charset = part.get_content_charset() or "utf-8"
                            body_text = _strip_html(payload.decode(charset, errors="replace"))
                            break
        else:
            payload = msg.get_payload(decode=True)
            if payload:
                charset = msg.get_content_charset() or "utf-8"
                raw = payload.decode(charset, errors="replace")
                body_text = _strip_html(raw) if msg.get_content_type() == "text/html" else raw
    except Exception:
        body_text = ""
    return re.sub(r"\s+", " ", body_text).strip()[:200]

async def parse_mbox_stream(byte_chunks: AsyncGenerator[bytes, None], content_length: int | None = None) -> Tuple[List[Email], List[str]]:
    warnings, emails = [], []
    if content_length and content_length > settings.max_upload_bytes:
        raise ValueError("Upload exceeds maximum allowed size of 50 MB.")

    total_bytes_read, current_buffer, oversized, email_index, remainder = 0, bytearray(), False, 0, b""

    def process_buffer(raw_bytes: bytes) -> Email | None:
        nonlocal email_index
        try:
            msg = email.message_from_bytes(raw_bytes, policy=email.policy.default)
        except Exception as e:
            warnings.append(f"Malformed message at index {email_index} skipped: {e}")
            return None

        labels_header = msg.get("X-Gmail-Labels", "")
        if labels_header and "inbox" not in [lbl.strip().lower() for lbl in labels_header.split(",")]:
            return None

        raw_from = str(msg.get("From", ""))
        sender_name, sender_address, sender_domain = parse_sender(raw_from)
        subject = str(msg.get("Subject", "")).strip()

        date_header = msg.get("Date")
        date_dt = datetime.now(timezone.utc)
        if date_header:
            try:
                date_dt = email.utils.parsedate_to_datetime(date_header)
                if date_dt.tzinfo is None:
                    date_dt = date_dt.replace(tzinfo=timezone.utc)
            except Exception:
                date_dt = datetime.now(timezone.utc)

        unsub_header = msg.get("List-Unsubscribe", "")
        unsub_target = None
        if unsub_header:
            match = re.search(r"<(https?://[^>]+|mailto:[^>]+)>", unsub_header)
            unsub_target = match.group(1) if match else unsub_header.strip()

        snippet = _extract_snippet_from_msg(msg)
        id_salt = f"{email_index}:{sender_address}:{subject}:{date_dt.isoformat()}"
        sha_sig = hashlib.sha256(id_salt.encode("utf-8")).hexdigest()[:12]
        email_id = f"mbox_{email_index}_{sha_sig}"
        email_index += 1

        return Email(
            id=email_id, sender_name=sender_name, sender_address=sender_address, sender_domain=sender_domain,
            subject=subject, subject_template=normalize_subject_template(subject), date=date_dt, snippet=snippet,
            unread=True, has_unsubscribe=bool(unsub_header), unsubscribe_target=unsub_target,
            protected_flag=is_protected_text(subject, snippet), state=EmailState.INBOX
        )

    async for chunk in byte_chunks:
        total_bytes_read += len(chunk)
        if total_bytes_read > settings.max_upload_bytes:
            raise ValueError("Upload exceeded maximum allowed size of 50 MB.")
        lines = (remainder + chunk).split(b"\n")
        remainder = lines.pop()

        for line in lines:
            line_nl = line + b"\n"
            if line_nl.startswith(b"From "):
                if current_buffer:
                    if not oversized:
                        em = process_buffer(bytes(current_buffer))
                        if em:
                            emails.append(em)
                            if len(emails) >= settings.max_emails_per_session:
                                warnings.append("Dataset reached 10,000 emails limit and was truncated.")
                                return emails, warnings
                    else:
                        warnings.append("Oversized email exceeding 1 MB was skipped.")
                    current_buffer.clear()
                    oversized = False
                continue
            if line_nl.startswith(b">From "):
                line_nl = line_nl[1:]
            if oversized:
                continue
            if len(current_buffer) + len(line_nl) > settings.max_message_buffer_bytes:
                oversized = True
                current_buffer.clear()
            else:
                current_buffer.extend(line_nl)

    if current_buffer and not oversized:
        em = process_buffer(bytes(current_buffer))
        if em and len(emails) < settings.max_emails_per_session:
            emails.append(em)

    return emails, warnings
