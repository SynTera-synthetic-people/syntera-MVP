"""
Create embeddings for source bank chunks from PostgreSQL
Uses raw SQL to query sync_source schema (not SQLModel)
"""

import asyncio
from sqlalchemy import text
from openai import OpenAI
from tqdm import tqdm

from app.config import settings
from app.db import AsyncSessionLocal

# Initialize OpenAI client
client = OpenAI(api_key=settings.OPENAI_API_KEY)


async def get_chunks_from_db(session, limit: int = None):
    """
    Get chunks from sync_source.content_chunk using raw SQL
    """
    query = text("""
        SELECT 
            cc.id as chunk_id,
            cc.document_id,
            cc.chunk_index,
            cc.content,
            cc.data_type,
            d.id as doc_id,
            d.title,
            d.source_type,
            d.source_url,
            d.domain
        FROM sync_source.content_chunk cc
        JOIN sync_source.document d ON cc.document_id = d.id
        WHERE cc.content IS NOT NULL 
        AND LENGTH(cc.content) > 10
        ORDER BY d.id, cc.chunk_index
        LIMIT :limit
    """)
    
    result = await session.execute(query, {"limit": limit or 1000000})
    rows = result.fetchall()
    
    # Convert to list of dicts
    chunks = []
    for row in rows:
        chunks.append({
            "chunk_id": str(row.chunk_id),
            "document_id": str(row.document_id),
            "chunk_index": row.chunk_index,
            "content": row.content,
            "data_type": row.data_type,
            "document_title": row.title or "Untitled",
            "source_type": row.source_type or "unknown",
            "source_url": row.source_url or "",
            "domain": row.domain or "general"
        })
    
    return chunks


def create_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """
    Create embeddings for multiple texts in one API call
    """
    try:
        response = client.embeddings.create(
            model=settings.EMBEDDING_MODEL,
            input=texts,
            dimensions=settings.EMBEDDING_DIMENSIONS
        )
        return [item.embedding for item in response.data]
    except Exception as e:
        print(f"❌ Error creating batch embeddings: {e}")
        return None


async def process_chunks_batch(chunks: list):
    """
    Process a batch of chunks: create embeddings and prepare for Qdrant
    """
    texts = [chunk["content"] for chunk in chunks]
    
    if not texts:
        return []
    
    # Create embeddings in batch
    embeddings = create_embeddings_batch(texts)
    
    if not embeddings:
        return []
    
    # Prepare points for Qdrant
    points = []
    for chunk, embedding in zip(chunks, embeddings):
        # Convert string ID to integer using hash
        # This creates a unique integer from the string ID
        point_id = abs(hash(chunk["chunk_id"])) % (10**15)  # Keep it under 15 digits
        
        payload = {
            "chunk_id": chunk["chunk_id"],  # Keep original ID in payload
            "document_id": chunk["document_id"],
            "document_title": chunk["document_title"],
            "source_type": chunk["source_type"],
            "source_url": chunk["source_url"],
            "domain": chunk["domain"],
            "chunk_index": chunk["chunk_index"],
            "data_type": chunk["data_type"] or "text",
            "content": chunk["content"],
            "content_preview": chunk["content"][:200],
        }
        
        points.append({
            "id": point_id,  # Use integer ID for Qdrant
            "vector": embedding,
            "payload": payload
        })
    
    return points


async def embed_all_chunks(limit: int = None):
    """
    Main function: Embed all chunks from sync_source.content_chunk
    """
    print("="*70)
    print("SOURCEBANK RAG - EMBEDDING WORKER")
    print("="*70)
    
    async with AsyncSessionLocal() as session:
        # Get chunks
        print("\nFetching chunks from sync_source.content_chunk...")
        chunks = await get_chunks_from_db(session, limit)
        
        total = len(chunks)
        print(f"Found {total:,} chunks to process")
        
        if total == 0:
            print("\n⚠️  No chunks found in database!")
            print("Make sure sync_source.content_chunk has data.")
            return []
        
        # Process in batches
        all_points = []
        batch_size = settings.EMBED_BATCH_SIZE
        
        print(f"\nProcessing in batches of {batch_size}...")
        for i in tqdm(range(0, total, batch_size), desc="Processing"):
            batch = chunks[i:i+batch_size]
            points = await process_chunks_batch(batch)
            all_points.extend(points)
        
        print(f"\n✅ Created {len(all_points):,} embeddings")
        print(f"   Dimensions: {settings.EMBEDDING_DIMENSIONS}")
        print(f"   Model: {settings.EMBEDDING_MODEL}")
        
        return all_points


if __name__ == "__main__":
    import sys
    
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    
    print(f"\n🧪 Testing with limit={limit}")
    points = asyncio.run(embed_all_chunks(limit=limit))
    
    if points:
        print(f"\n📊 Sample Point:")
        print(f"   ID: {points[0]['id']}")
        print(f"   Vector length: {len(points[0]['vector'])}")
        print(f"   Payload keys: {list(points[0]['payload'].keys())}")
        print(f"   Content preview: {points[0]['payload']['content_preview']}")