import re

EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_PATTERN = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")
URL_PATTERN = re.compile(r"https?://\S+|www\.\S+")
DIGIT_RUN_PATTERN = re.compile(r"\b\d{6,}\b")

def redact_text(text: str) -> str:
    if not text:
        return ""
    s = EMAIL_PATTERN.sub("[EMAIL]", text)
    s = URL_PATTERN.sub("[LINK]", s)
    s = PHONE_PATTERN.sub("[PHONE]", s)
    s = DIGIT_RUN_PATTERN.sub("[ID]", s)
    return s

def sanitize_cluster_for_gemini(cluster_dict: dict) -> dict:
    safe = dict(cluster_dict)
    safe.pop("sender_address", None)
    safe.pop("unsubscribe_targets", None)
    safe.pop("email_ids", None)
    if "sample_subjects" in safe:
        safe["sample_subjects"] = [redact_text(subj)[:80] for subj in safe["sample_subjects"]]
    if "sample_snippet" in safe:
        safe["sample_snippet"] = redact_text(safe["sample_snippet"])[:120]
    return safe
