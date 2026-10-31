import asyncio, hashlib, logging, math, random
from typing import Dict, List, Optional
from app.config import settings
from app.core.decide.redaction import redact_text

logger = logging.getLogger("zerohour.embeddings")
_EMBEDDING_CACHE: Dict[str, List[float]] = {}
CACHE_VERSION = "v1"

def compute_cache_key(model: str, text: str) -> str:
    raw = f"{model}|{CACHE_VERSION}|{text.strip().lower()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    return max(0.0, min(1.0, dot / (norm_a * norm_b))) if norm_a and norm_b else 0.0

async def get_text_embeddings_batched(texts: List[str]) -> Dict[str, Optional[List[float]]]:
    results: Dict[str, Optional[List[float]]] = {}
    if not texts:
        return results

    uncached, text_to_sanitized = [], {}
    for t in texts:
        sanitized = redact_text(t)[:256].strip()
        text_to_sanitized[t] = sanitized
        key = compute_cache_key(settings.gemini_embedding_model, sanitized)
        if key in _EMBEDDING_CACHE:
            results[t] = _EMBEDDING_CACHE[key]
        else:
            uncached.append(t)

    if not uncached or not settings.gemini_api_key or not settings.enable_semantic_clustering:
        for t in uncached:
            results[t] = None
        return results

    try:
        from google import genai
        client = genai.Client(api_key=settings.gemini_api_key)
        payload = [text_to_sanitized[t] for t in uncached]
        for attempt in range(3):
            try:
                response = await asyncio.wait_for(
                    client.aio.models.embed_content(model=settings.gemini_embedding_model, contents=payload),
                    timeout=15.0
                )
                if response and hasattr(response, "embeddings") and response.embeddings:
                    for idx, emb in enumerate(response.embeddings):
                        orig_t = uncached[idx]
                        vals = getattr(emb, "values", None)
                        if vals:
                            _EMBEDDING_CACHE[compute_cache_key(settings.gemini_embedding_model, text_to_sanitized[orig_t])] = vals
                            results[orig_t] = vals
                        else:
                            results[orig_t] = None
                    break
            except Exception as e:
                logger.warning("Embedding attempt %d failed: %s", attempt + 1, type(e).__name__)
                if attempt < 2:
                    await asyncio.sleep((1.5 ** attempt) + random.uniform(0.1, 0.4))
                else:
                    for t in uncached:
                        results[t] = None
    except Exception as e:
        logger.error("Embedding fatal error (%s); falling back to deterministic Jaccard.", type(e).__name__)
        for t in uncached:
            results[t] = None
    return results
