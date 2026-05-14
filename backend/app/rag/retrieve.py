"""
Retrieve relevant chunks from Qdrant based on query
"""

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

def search_qdrant(
    query: str,
    domain: str = None,
    top_k: int = None,
    score_threshold: float = 0.0
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
    
    # Search Qdrant
    search_results = qdrant_client.query_points(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        query=query_vector,
        query_filter=query_filter,
        limit=top_k,
        score_threshold=score_threshold
    ).points
    
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