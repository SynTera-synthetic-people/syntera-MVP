"""
End-to-end RAG test with OpenAI completion
Full pipeline: Query -> Retrieve -> Generate Answer
"""

from openai import OpenAI
from .retrieve import retrieve_context, search_qdrant
from app.config import settings


client = OpenAI(api_key=settings.OPENAI_API_KEY)


def generate_answer(query: str, domain: str = None, model: str = "gpt-4o-mini") -> dict:
    """
    Full RAG pipeline: Retrieve context + Generate answer
    
    Args:
        query: User question
        domain: Filter by domain (optional)
        model: OpenAI model to use
    
    Returns:
        Dict with query, context, answer, sources
    """
    print(f"🔍 Retrieving context for: '{query}'")
    
    # Step 1: Retrieve relevant chunks
    search_results = search_qdrant(query, domain=domain, top_k=8)  # Matches your config
    context = retrieve_context(query, domain=domain, top_k=8)
    
    if not search_results:
        return {
            "query": query,
            "context": "No relevant context found",
            "answer": "I don't have enough information to answer this question based on the available sources.",
            "sources": [],
            "model": model
        }
    
    # Get formatted context
    context = retrieve_context(query, domain=domain, top_k=8)
    
    # Step 2: Generate answer with GPT
    print(f"🤖 Generating answer using {model}...")
    
    system_prompt = """You are a behavioral insights expert specializing in consumer research analysis.

    INSTRUCTIONS:
    1. Answer based ONLY on the provided research context
    2. Cite specific sources using [Source N] notation
    3. Include quantitative data and statistics when available
    4. Focus on actionable insights and patterns
    5. If asked about specific regions (e.g., India) but context is global, acknowledge the limitation
    6. If context lacks relevant information, clearly state: "The available research does not contain specific information about [topic]"
    7. Prioritize recent data and regional specificity when available

    ANSWER FORMAT:
    - Start with direct answer
    - Support with evidence from sources
    - Cite sources inline
    - End with any limitations/caveats"""
    
    user_prompt = f"""Context from research sources:

{context}

Question: {query}

Please provide a detailed answer based on the context above. Cite specific sources when making claims."""
    
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.7,
        max_tokens=800
    )
    
    answer = response.choices[0].message.content
    
    # Format sources
    sources = [
        {
            "title": r["document_title"],
            "domain": r["domain"],
            "relevance": f"{r['score']*100:.1f}%",
            "preview": r["content_preview"]
        }
        for r in search_results
    ]
    
    return {
        "query": query,
        "context": context,
        "answer": answer,
        "sources": sources,
        "model": model
    }


if __name__ == "__main__":
    print("="*70)
    print("SOURCEBANK RAG - FULL PIPELINE TEST")
    print("="*70)
    
    # Test queries
    test_queries = [
        "What are the shopping behaviors of millennials in India?",
        "How do consumers decide between food delivery platforms?",
        "What factors influence ride-sharing app choices in urban areas?"
    ]
    
    for query in test_queries:
        print(f"\n{'='*70}")
        print(f"QUERY: {query}")
        print(f"{'='*70}\n")
        
        result = generate_answer(query)
        
        print(f"ANSWER:\n{result['answer']}\n")
        
        print(f"SOURCES ({len(result['sources'])}):")
        for i, source in enumerate(result['sources'], 1):
            print(f"  [{i}] {source['title']} (Domain: {source['domain']}, Relevance: {source['relevance']})")
        
        print(f"\nModel: {result['model']}")
        print(f"{'='*70}\n")