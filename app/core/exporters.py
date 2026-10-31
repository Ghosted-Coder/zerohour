import csv, hashlib, io
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Set, Tuple
from app.core.models import Action, Cluster, Email

ATOM_NS = "http://www.w3.org/2005/Atom"
APPS_NS = "http://schemas.google.com/apps/2006"

def _find_longest_common_subject_phrase(subjects: List[str]) -> str:
    clean = [s.strip() for s in subjects]
    if not clean or any(len(s) < 3 for s in clean):
        return ""
    first, best = clean[0], ""
    for start in range(len(first)):
        for end in range(start + 3, len(first) + 1):
            cand = first[start:end].strip()
            if len(cand) >= 3 and len(cand) > len(best) and all(cand.lower() in s.lower() for s in clean[1:]):
                best = cand
    return best.strip()

def generate_filters_xml(clusters: List[Cluster], emails: List[Email]) -> Tuple[str, List[str]]:
    warnings, emails_by_sender, decided_by_sender = [], defaultdict(list), defaultdict(list)
    email_to_cluster = {eid: c for c in clusters for eid in c.email_ids}

    for em in emails:
        emails_by_sender[em.sender_address.lower()].append(em)

    for c in clusters:
        if not c.protected and c.status == "decided" and c.decision:
            decided_by_sender[c.sender_address.lower()].append(c)

    filter_rules = []
    for sender in sorted(emails_by_sender.keys()):
        sender_emails = emails_by_sender[sender]
        decided_clusters = decided_by_sender.get(sender, [])
        all_sender_ids = {em.id for em in sender_emails}
        decided_cluster_ids = {eid for dc in decided_clusters for eid in dc.email_ids}

        has_protected = any(em.protected_flag or (email_to_cluster.get(em.id) and email_to_cluster[em.id].protected) for em in sender_emails)
        can_emit_broad = not has_protected and decided_cluster_ids == all_sender_ids and len(decided_clusters) > 0

        if can_emit_broad:
            actions = {dc.decision.action for dc in decided_clusters if dc.decision}
            if all(a == Action.ARCHIVE for a in actions):
                filter_rules.append((sender, Action.ARCHIVE, decided_clusters[0].category.value if decided_clusters[0].category else "Cleaned", None))
                continue
            elif all(a in (Action.TRASH, Action.UNSUBSCRIBE) for a in actions):
                filter_rules.append((sender, Action.TRASH, "Trash", None))
                continue

        for dc in decided_clusters:
            if not dc.decision or dc.decision.action == Action.KEEP:
                continue
            dc_subjects = [em.subject for em in sender_emails if em.id in dc.email_ids and em.subject]
            longest = _find_longest_common_subject_phrase(dc_subjects)
            if len(longest) < 3:
                warnings.append(f"Conflicting cluster for sender '{sender}' omitted from filters.xml: no common phrase >= 3 chars.")
                continue
            if any(longest.lower() in em.subject.lower() for em in sender_emails if em.id not in dc.email_ids):
                warnings.append(f"Conflicting cluster for sender '{sender}' omitted from filters.xml: phrase '{longest}' collides with other emails.")
                continue
            filter_rules.append((sender, dc.decision.action, dc.category.value if dc.category else "Cleaned", longest))

    now_utc_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ET.register_namespace("", ATOM_NS)
    ET.register_namespace("apps", APPS_NS)

    root = ET.Element(f"{{{ATOM_NS}}}feed")
    ET.SubElement(root, f"{{{ATOM_NS}}}title").text = "Mail Filters"
    ET.SubElement(root, f"{{{ATOM_NS}}}id").text = "tag:mail.google.com,2008:filters"
    ET.SubElement(root, f"{{{ATOM_NS}}}updated").text = now_utc_str

    if len(filter_rules) > 500:
        warnings.append("filters.xml reached Gmail 500-entry limit; excess rules truncated.")

    for sender, action, cat, subj in filter_rules[:500]:
        stable_id = hashlib.sha256(f"{sender}|{subj or '*'}|{action.value}".encode("utf-8")).hexdigest()[:16]
        entry = ET.SubElement(root, f"{{{ATOM_NS}}}entry")
        ET.SubElement(entry, f"{{{ATOM_NS}}}category", term="filter")
        ET.SubElement(entry, f"{{{ATOM_NS}}}title").text = "Mail Filter"
        ET.SubElement(entry, f"{{{ATOM_NS}}}id").text = f"tag:mail.google.com,2008:filter:{stable_id}"
        ET.SubElement(entry, f"{{{ATOM_NS}}}updated").text = now_utc_str
        ET.SubElement(entry, f"{{{ATOM_NS}}}content")

        ET.SubElement(entry, f"{{{APPS_NS}}}property", name="from", value=sender)
        if subj:
            ET.SubElement(entry, f"{{{APPS_NS}}}property", name="subject", value=subj)
        if action == Action.ARCHIVE:
            ET.SubElement(entry, f"{{{APPS_NS}}}property", name="shouldArchive", value="true")
            ET.SubElement(entry, f"{{{APPS_NS}}}property", name="shouldMarkAsRead", value="true")
            ET.SubElement(entry, f"{{{APPS_NS}}}property", name="label", value=f"ZeroHour/{cat.capitalize()}")
        elif action in (Action.TRASH, Action.UNSUBSCRIBE):
            ET.SubElement(entry, f"{{{APPS_NS}}}property", name="shouldTrash", value="true")

    return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8"), warnings

def _neutralize_csv_injection(val: str) -> str:
    if not val:
        return ""
    i, n = 0, len(val)
    while i < n and (val[i] in " \t\r\n\ufeff" or ord(val[i]) < 32 or ord(val[i]) == 127):
        i += 1
    if i < n and val[i] in ("=", "+", "-", "@", "\t", "\r", "\n"):
        return f"'{val}"
    if val[0] in ("\t", "\r", "\n", "\ufeff") or ord(val[0]) < 32 or ord(val[0]) == 127:
        return f"'{val}"
    return val

def generate_cleaned_csv(emails: List[Email], clusters: List[Cluster]) -> str:
    email_to_cluster = {eid: c for c in clusters for eid in c.email_ids}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["email_id", "sender", "subject", "date", "cluster", "category", "action"])
    for em in emails:
        c = email_to_cluster.get(em.id)
        writer.writerow([
            _neutralize_csv_injection(em.id), _neutralize_csv_injection(em.sender_address),
            _neutralize_csv_injection(em.subject), em.date.isoformat(),
            _neutralize_csv_injection(c.cluster_id if c else "unclustered"),
            _neutralize_csv_injection(c.category.value if c and c.category else "unassigned"),
            _neutralize_csv_injection(c.decision.action.value if c and c.decision else "none")
        ])
    return output.getvalue()

def generate_unsubscribe_csv(clusters: List[Cluster]) -> Tuple[str, int, List[str]]:
    warnings, output = [], io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["sender", "unsubscribe_target", "email_count"])
    distinct_links = set()

    for c in clusters:
        if c.status == "decided" and c.decision and c.decision.action == Action.UNSUBSCRIBE:
            if not c.unsubscribe_targets:
                warnings.append(f"Unsubscribe decision for sender '{c.sender_address}' has no usable List-Unsubscribe link; exported for manual followup.")
                writer.writerow([_neutralize_csv_injection(c.sender_address), _neutralize_csv_injection("No direct link extracted (manual followup required)"), str(c.count)])
            else:
                for target in c.unsubscribe_targets:
                    distinct_links.add(target)
                    writer.writerow([_neutralize_csv_injection(c.sender_address), _neutralize_csv_injection(target), str(c.count)])
    return output.getvalue(), len(distinct_links), warnings
