import hashlib
from collections import Counter, defaultdict
from typing import Dict, List, Set, Tuple
from app.config import settings
from app.core.decide.embeddings import cosine_similarity, get_text_embeddings_batched
from app.core.models import Cluster, Email
from app.core.normalize import extract_role_hint, is_personal_candidate

def _token_jaccard(template_a: str, template_b: str) -> float:
    tokens_a, tokens_b = set(template_a.split()), set(template_b.split())
    if not tokens_a and not tokens_b:
        return 1.0 if template_a == template_b else 0.0
    union = tokens_a.union(tokens_b)
    return len(tokens_a.intersection(tokens_b)) / len(union) if union else 1.0

def _compute_canonical_cluster_id(sender_address: str, protected: bool, emails: List[Email]) -> str:
    templates_str = "|".join(sorted(set(em.subject_template for em in emails if em.subject_template)))
    sorted_ids_str = "|".join(sorted(em.id for em in emails))
    raw = f"{sender_address.lower()}|{protected}|{templates_str}|{sorted_ids_str}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

def _find_cluster_medoid(group: List[Email]) -> str:
    counts = Counter(em.subject_template for em in group)
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0] if counts else ""

async def cluster_emails(emails: List[Email]) -> Tuple[List[Cluster], List[str], List[str]]:
    sorted_input = sorted(emails, key=lambda e: (e.sender_address.lower(), e.date.isoformat(), e.subject_template, e.id))
    sender_counts = defaultdict(int)
    for em in sorted_input:
        sender_counts[em.sender_address.lower()] += 1

    excluded_personal_ids, retained_emails = [], []
    for em in sorted_input:
        if is_personal_candidate(em.sender_address, em.has_unsubscribe, sender_counts[em.sender_address.lower()]):
            excluded_personal_ids.append(em.id)
        else:
            retained_emails.append(em)

    partitions = defaultdict(list)
    for em in retained_emails:
        partitions[(em.sender_address.lower(), em.protected_flag)].append(em)

    raw_clusters = []
    for key in sorted(partitions.keys(), key=lambda k: (k[0], k[1])):
        partition_emails = partitions[key]
        sub_groups = []
        unique_templates = list(set(em.subject_template for em in partition_emails if em.subject_template))
        embeddings_map = await get_text_embeddings_batched(unique_templates)

        for em in partition_emails:
            best_idx, best_sim = None, -1.0
            for idx, group in enumerate(sub_groups):
                medoid = _find_cluster_medoid(group)
                jaccard_sim = _token_jaccard(em.subject_template, medoid)
                is_match, effective_score = False, jaccard_sim

                if jaccard_sim >= 0.60:
                    is_match = True
                elif 0.40 <= jaccard_sim < 0.60:
                    emb_em, emb_medoid = embeddings_map.get(em.subject_template), embeddings_map.get(medoid)
                    if emb_em and emb_medoid and cosine_similarity(emb_em, emb_medoid) >= settings.embedding_similarity_threshold:
                        is_match = True
                        effective_score = 0.5 * jaccard_sim + 0.5 * cosine_similarity(emb_em, emb_medoid)

                if is_match and effective_score > best_sim:
                    best_sim, best_idx = effective_score, idx

            if best_idx is not None:
                sub_groups[best_idx].append(em)
            else:
                sub_groups.append([em])

        for group in sub_groups:
            group.sort(key=lambda e: (e.date.isoformat(), e.id))
            raw_clusters.append(group)

    deck_clusters, left_out_singleton_ids = [], []
    for group in raw_clusters:
        if len(group) == 1:
            left_out_singleton_ids.append(group[0].id)
            continue

        first = group[0]
        sender_address, sender_name, sender_domain = first.sender_address, first.sender_name, first.sender_domain
        role_hint = extract_role_hint(sender_address)
        protected = any(em.protected_flag for em in group)
        email_ids = [em.id for em in group]
        sorted_dates = sorted(em.date for em in group)
        date_range = sorted_dates[0].strftime("%Y-%m-%d") if sorted_dates[0].strftime("%Y-%m-%d") == sorted_dates[-1].strftime("%Y-%m-%d") else f"{sorted_dates[0].strftime('%Y-%m-%d')} - {sorted_dates[-1].strftime('%Y-%m-%d')}"
        unread_count = sum(1 for em in group if em.unread)
        unsub_targets = sorted(list(set(em.unsubscribe_target for em in group if em.has_unsubscribe and em.unsubscribe_target)))

        seen_subjs, sample_subjs = set(), []
        for em in group:
            s = em.subject[:80].strip()
            if s and s not in seen_subjs:
                seen_subjs.add(s)
                sample_subjs.append(s)
            if len(sample_subjs) >= 3:
                break

        cid = _compute_canonical_cluster_id(sender_address, protected, group)
        deck_clusters.append(Cluster(
            cluster_id=cid, sender_name=sender_name, sender_address=sender_address, sender_domain=sender_domain,
            role_hint=role_hint, email_ids=email_ids, count=len(group), unread_count=unread_count,
            unread_ratio=round(unread_count / len(group), 2), date_range=date_range, has_unsubscribe=bool(unsub_targets),
            unsubscribe_targets=unsub_targets, sample_subjects=sample_subjs,
            sample_snippet=next((em.snippet[:120].strip() for em in group if em.snippet), ""),
            protected=protected, status="open"
        ))

    deck_clusters.sort(key=lambda c: (-c.count, c.cluster_id))
    return deck_clusters, excluded_personal_ids, left_out_singleton_ids

def partition_into_waves(clusters: List[Cluster], wave_size: int = 60) -> List[List[Cluster]]:
    return [clusters[i : i + wave_size] for i in range(0, len(clusters), wave_size)]
