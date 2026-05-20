"""
Retrieve relevant chunks from Qdrant based on query.

This module intentionally keeps the older search_qdrant() API intact while
adding a controlled Sourcebank wrapper for report generation. The wrapper gives
Perplexity-style output from our approved/source-bank links instead of doing
open internet retrieval at report time.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue
from openai import OpenAI

from app.config import settings  # Import the singleton instance

# Initialize clients
qdrant_client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)

openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

AUTHORITY_SCORES = {
    "official": 1.0,
    "partner": 0.9,
    "curated": 0.82,
    "user_uploaded": 0.7,
    "experimental": 0.45,
}

CONFIDENCE_HIGH_THRESHOLD = 0.72
CONFIDENCE_MEDIUM_THRESHOLD = 0.5


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return [str(value).strip()] if str(value).strip() else []


def _normalize_domain(domain: Optional[str]) -> Optional[str]:
    if not domain:
        return None
    normalized = str(domain).strip().lower()
    return normalized or None


def _keyword_hits(text: str, keywords: list[str]) -> int:
    if not text or not keywords:
        return 0
    haystack = text.lower()
    return sum(1 for kw in keywords if kw and kw.lower() in haystack)


def _build_filter(
    *,
    domain: Optional[str] = None,
    exploration_id: Optional[str] = None,
    source_group: Optional[str] = None,
    approved_only: bool = False,
    allowed_use: Optional[str] = None,
) -> Optional[Filter]:
    must: list[FieldCondition] = []

    normalized_domain = _normalize_domain(domain)
    if normalized_domain and normalized_domain != "general":
        must.append(FieldCondition(key="domain", match=MatchValue(value=normalized_domain)))

    if exploration_id:
        must.append(FieldCondition(key="exploration_id", match=MatchValue(value=exploration_id)))

    if source_group:
        must.append(FieldCondition(key="source_group", match=MatchValue(value=source_group)))

    if approved_only:
        must.append(FieldCondition(key="approval_status", match=MatchValue(value="approved")))

    if allowed_use:
        must.append(FieldCondition(key="allowed_use", match=MatchValue(value=allowed_use)))

    return Filter(must=must) if must else None


def _hit_to_result(hit) -> dict:
    payload = hit.payload or {}
    source_keywords = _as_list(payload.get("source_keywords") or payload.get("keywords"))
    allowed_use = _as_list(payload.get("allowed_use"))

    return {
        "chunk_id": payload.get("chunk_id"),
        "document_id": payload.get("document_id"),
        "document_title": payload.get("document_title") or "Untitled",
        "source_type": payload.get("source_type") or "unknown",
        "source_url": payload.get("source_url") or "",
        "domain": payload.get("domain") or "general",
        "source_group": payload.get("source_group"),
        "source_keywords": source_keywords,
        "approval_status": payload.get("approval_status") or "legacy",
        "authority_tier": payload.get("authority_tier") or "user_uploaded",
        "quality_score": payload.get("quality_score"),
        "allowed_use": allowed_use,
        "content": payload.get("content") or "",
        "content_preview": payload.get("content_preview") or (payload.get("content") or "")[:200],
        "score": float(hit.score or 0),
        "chunk_index": payload.get("chunk_index"),
    }


def _search_qdrant_vector(
    query_vector: list[float],
    *,
    query_filter: Optional[Filter],
    top_k: int,
    score_threshold: float,
) -> list[dict]:
    search_results = qdrant_client.search(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query_vector=query_vector,
        query_filter=query_filter,
        limit=top_k,
        score_threshold=score_threshold,
        with_payload=True,
    )
    return [_hit_to_result(hit) for hit in search_results]


def create_query_embedding(query: str) -> list[float]:
    """
    Create embedding for search query
    """
    response = openai_client.embeddings.create(
        model=settings.EMBEDDING_MODEL,
        input=query,
        dimensions=settings.EMBEDDING_DIMENSIONS
    )
    return response.data[0].embedding


def detect_domain_from_query(query: str) -> str:
    """
    Auto-detect domain from query keywords
    """
    query_lower = query.lower()
    
    # Ecommerce keywords
    if any(word in query_lower for word in ['ecommerce', 'e-commerce', 'shopping', 'online shopping', 
                                              'amazon', 'flipkart', 'retail', 'purchase', 'buying']):
        return 'ecom'
    
    # Food keywords
    if any(word in query_lower for word in ['food', 'delivery', 'restaurant', 'swiggy', 'zomato', 
                                              'order food', 'meal', 'dining']):
        return 'food'
    
    # Mobility keywords
    if any(word in query_lower for word in ['ride', 'uber', 'ola', 'taxi', 'cab', 'transportation',
                                              'ride-sharing', 'rideshare', 'mobility']):
        return 'mobility'
    
    # Finance keywords
    if any(word in query_lower for word in ['payment', 'finance', 'bank', 'wallet', 'paytm', 'phonepe',
                                              'transaction', 'money', 'financial']):
        return 'finance'
    
    return None  # No specific domain detected

def _legacy_search_qdrant_unfiltered(
    query: str,
    domain: str = None,
    top_k: int = None,
    score_threshold: float = 0.0,
    *,
    exploration_id: Optional[str] = None,
    source_group: Optional[str] = None,
    approved_only: bool = False,
    allowed_use: Optional[str] = None,
    allow_unfiltered_fallback: bool = True,
) -> list[dict]:
    """
    Search Qdrant for relevant chunks
    """
    if top_k is None:
        top_k = settings.TOP_K_RESULTS
    
    # DISABLED domain auto-detection (sourcebank has 'general' domain only)
    # Enable this when documents have proper domain tags
    # if domain is None:
    #     detected_domain = detect_domain_from_query(query)
    #     if detected_domain:
    #         print(f"   🎯 Auto-detected domain: {detected_domain}")
    #         domain = detected_domain
    
    # Create query embedding
    query_vector = create_query_embedding(query)
    
    # Don't use domain filter for now (all documents are 'general')
    query_filter = None
    
    # Search Qdrant (qdrant-client 1.7.x — use .search(), not .query_points())
    search_results = qdrant_client.search(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query_vector=query_vector,
        query_filter=query_filter,
        limit=top_k,
        score_threshold=score_threshold,
        with_payload=True,
    )
    
    # Format results
    results = []
    for hit in search_results:
        results.append({
            "chunk_id": hit.payload["chunk_id"],
            "document_id": hit.payload["document_id"],
            "document_title": hit.payload["document_title"],
            "source_type": hit.payload["source_type"],
            "domain": hit.payload["domain"],
            "content": hit.payload["content"],
            "content_preview": hit.payload["content_preview"],
            "score": hit.score,
            "chunk_index": hit.payload["chunk_index"]
        })
    
    return results


def search_qdrant(
    query: str,
    domain: str = None,
    top_k: int = None,
    score_threshold: float = 0.0,
    *,
    exploration_id: Optional[str] = None,
    source_group: Optional[str] = None,
    approved_only: bool = False,
    allowed_use: Optional[str] = None,
    allow_unfiltered_fallback: bool = True,
) -> list[dict]:
    """
    Search Qdrant with optional source governance filters.

    Keeping the public function name stable lets the rest of the codebase
    continue using search_qdrant() while report generation can opt into
    source governance filters.
    """
    if top_k is None:
        top_k = settings.TOP_K_RESULTS

    query_vector = create_query_embedding(query)
    query_filter = _build_filter(
        domain=domain,
        exploration_id=exploration_id,
        source_group=source_group,
        approved_only=approved_only,
        allowed_use=allowed_use,
    )
    results = _search_qdrant_vector(
        query_vector,
        query_filter=query_filter,
        top_k=top_k,
        score_threshold=score_threshold,
    )

    # Existing collections may contain legacy points without governance payloads.
    # If a strict filter returns nothing, fall back to Sourcebank-wide search so
    # current reports keep working. This never performs open web retrieval.
    if not results and query_filter is not None and allow_unfiltered_fallback:
        results = _search_qdrant_vector(
            query_vector,
            query_filter=None,
            top_k=top_k,
            score_threshold=score_threshold,
        )

    return results


def _result_authority_score(result: dict) -> float:
    tier = str(result.get("authority_tier") or "user_uploaded").lower()
    return AUTHORITY_SCORES.get(tier, AUTHORITY_SCORES["user_uploaded"])


def _result_quality_score(result: dict) -> float:
    raw = result.get("quality_score")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return 0.65
    return max(0.0, min(value, 1.0))


def _score_result(result: dict, *, query: str, domain: Optional[str], keywords: list[str]) -> float:
    vector_score = float(result.get("score") or 0.0)
    authority_score = _result_authority_score(result)
    quality_score = _result_quality_score(result)

    result_domain = _normalize_domain(result.get("domain"))
    requested_domain = _normalize_domain(domain)
    domain_score = 0.0
    if requested_domain and result_domain == requested_domain:
        domain_score = 1.0
    elif not requested_domain or result_domain == "general":
        domain_score = 0.5

    text = " ".join(
        str(part or "")
        for part in (
            result.get("document_title"),
            result.get("content_preview"),
            result.get("content"),
        )
    )
    keyword_count = _keyword_hits(text, keywords)
    keyword_score = min(keyword_count / max(len(keywords), 1), 1.0) if keywords else 0.0

    return round(
        (vector_score * 0.62)
        + (authority_score * 0.14)
        + (quality_score * 0.10)
        + (domain_score * 0.08)
        + (keyword_score * 0.06),
        4,
    )


def _dedupe_sources(results: list[dict], max_sources: int) -> list[dict]:
    seen: set[str] = set()
    sources: list[dict] = []
    for result in results:
        doc_key = str(result.get("document_id") or result.get("source_url") or result.get("document_title"))
        if not doc_key or doc_key in seen:
            continue
        seen.add(doc_key)
        sources.append(result)
        if len(sources) >= max_sources:
            break
    return sources


def _confidence_label(results: list[dict]) -> str:
    if not results:
        return "none"
    top_score = float(results[0].get("score") or 0.0)
    if top_score >= CONFIDENCE_HIGH_THRESHOLD:
        return "high"
    if top_score >= CONFIDENCE_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def _format_sourcebank_context(sources: list[dict]) -> str:
    lines: list[str] = []
    for i, source in enumerate(sources, 1):
        url = source.get("source_url") or "Not Available"
        domain = source.get("domain") or "general"
        approval = source.get("approval_status") or "legacy"
        preview = str(source.get("content_preview") or source.get("content") or "").strip()
        preview = re.sub(r"\s+", " ", preview)[:500]
        lines.append(
            f"[SB-{i}] {source.get('document_title') or 'Untitled'} - {preview}\n"
            f"Source URL: {url}\n"
            f"Domain: {domain}; Approval: {approval}; Relevance: {float(source.get('score') or 0):.3f}"
        )
    return "\n\n".join(lines)


def controlled_sourcebank_search(
    query: str,
    *,
    domain: Optional[str] = None,
    keywords: Optional[list[str]] = None,
    source_group: Optional[str] = None,
    exploration_id: Optional[str] = None,
    top_k: int = 8,
    max_sources: int = 3,
    score_threshold: float = 0.0,
    approved_only: bool = False,
    allowed_use: Optional[str] = "qual_report",
    allow_legacy_fallback: bool = True,
) -> dict:
    """
    Controlled Sourcebank wrapper.

    It searches only our indexed Sourcebank/Qdrant collection and returns a
    Perplexity-style object: context text, top source citations, confidence,
    and fallback level. No live internet search happens here.
    """
    normalized_keywords = _as_list(keywords)
    inferred_domain = domain or detect_domain_from_query(query)

    attempts = [
        {
            "level": "controlled_domain",
            "domain": inferred_domain,
            "source_group": source_group,
            "approved_only": approved_only,
            "allowed_use": allowed_use,
        },
        {
            "level": "controlled_sourcebank",
            "domain": None,
            "source_group": source_group,
            "approved_only": approved_only,
            "allowed_use": allowed_use,
        },
    ]
    if allow_legacy_fallback and approved_only:
        attempts.append(
            {
                "level": "legacy_sourcebank",
                "domain": inferred_domain,
                "source_group": source_group,
                "approved_only": False,
                "allowed_use": None,
            }
        )

    selected_results: list[dict] = []
    fallback_level = "empty_context"

    for attempt in attempts:
        results = search_qdrant(
            query,
            domain=attempt["domain"],
            top_k=max(top_k, max_sources),
            score_threshold=score_threshold,
            exploration_id=exploration_id,
            source_group=attempt["source_group"],
            approved_only=attempt["approved_only"],
            allowed_use=attempt["allowed_use"],
            allow_unfiltered_fallback=False,
        )
        if results:
            fallback_level = attempt["level"]
            selected_results = results
            break

    if not selected_results and allow_legacy_fallback:
        selected_results = search_qdrant(
            query,
            domain=None,
            top_k=max(top_k, max_sources),
            score_threshold=score_threshold,
            allow_unfiltered_fallback=True,
        )
        if selected_results:
            fallback_level = "legacy_sourcebank"

    for result in selected_results:
        result["controlled_score"] = _score_result(
            result,
            query=query,
            domain=inferred_domain,
            keywords=normalized_keywords,
        )
    selected_results.sort(key=lambda item: item.get("controlled_score", 0), reverse=True)

    sources = _dedupe_sources(selected_results, max_sources)
    context = _format_sourcebank_context(sources)

    return {
        "query": query,
        "domain": inferred_domain,
        "source_group": source_group,
        "keywords": normalized_keywords,
        "fallback_level": fallback_level,
        "confidence": _confidence_label(selected_results),
        "context": context,
        "sources": [
            {
                "citation_id": f"SB-{i}",
                "document_id": source.get("document_id"),
                "chunk_id": source.get("chunk_id"),
                "title": source.get("document_title"),
                "url": source.get("source_url"),
                "domain": source.get("domain"),
                "source_group": source.get("source_group"),
                "approval_status": source.get("approval_status"),
                "authority_tier": source.get("authority_tier"),
                "score": source.get("score"),
                "controlled_score": source.get("controlled_score"),
                "chunk_index": source.get("chunk_index"),
            }
            for i, source in enumerate(sources, 1)
        ],
        "results_count": len(selected_results),
    }


def retrieve_context(query: str, domain: str = None, top_k: int = 8) -> str:
    """
    Retrieve context for RAG
    Returns formatted context string ready for LLM
    
    Args:
        query: Search query
        domain: Filter by domain (optional)
        top_k: Number of chunks to retrieve
    
    Returns:
        Formatted context string
    """
    results = search_qdrant(query, domain=domain, top_k=top_k)
    
    if not results:
        return "No relevant context found."
    
    # Format context
    context_parts = []
    for i, result in enumerate(results, 1):
        context_parts.append(
            f"[Source {i}] {result['document_title']}\n"
            f"Domain: {result['domain']}\n"
            f"Relevance: {result['score']:.2%}\n\n"
            f"{result['content']}\n"
        )
    
    return "\n" + "---\n\n".join(context_parts)


if __name__ == "__main__":
    print("="*70)
    print("SOURCEBANK RAG - RETRIEVAL TEST")
    print("="*70)
    
    # Test queries
    test_queries = [
        "What are the behavioral patterns of millennials in ecommerce?",
        "How do consumers choose food delivery platforms?",
        "What influences ride-sharing app preferences?"
    ]
    
    for query in test_queries:
        print(f"\n{'='*70}")
        print(f"Query: {query}")
        print(f"{'='*70}\n")
        
        results = search_qdrant(query, top_k=3)
        
        if results:
            print(f"Found {len(results)} results:\n")
            
            for i, result in enumerate(results, 1):
                print(f"[{i}] Score: {result['score']:.3f} ({result['score']*100:.1f}%)")
                print(f"    Title: {result['document_title']}")
                print(f"    Domain: {result['domain']}")
                print(f"    Preview: {result['content_preview'][:100]}...")
                print()
        else:
            print("No results found.\n")
