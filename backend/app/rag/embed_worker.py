"""
Create embeddings for source bank chunks from PostgreSQL
Uses raw SQL to query sync_source schema (not SQLModel)
"""

import asyncio
import hashlib
import json
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
            cc.content_hash as chunk_content_hash,
            d.id as doc_id,
            d.title,
            d.source_type,
            d.source_url,
            d.domain,
            d.exploration_id,
            d.registry_id,
            d.source_group,
            d.source_keywords,
            d.approval_status,
            d.authority_tier,
            d.quality_score,
            d.allowed_use,
            d.citation_metadata
        FROM sync_source.content_chunk cc
        JOIN sync_source.document d ON cc.document_id = d.id
        WHERE cc.content IS NOT NULL
        AND LENGTH(cc.content) > 10
        AND (cc.embedding_status IS NULL OR cc.embedding_status = 'pending')
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
            "domain": row.domain or "general",
            "exploration_id": row.exploration_id,
            "registry_id": row.registry_id,
            "source_group": row.source_group,
            "source_keywords": row.source_keywords or [],
            "approval_status": row.approval_status or "approved",
            "authority_tier": row.authority_tier or "user_uploaded",
            "quality_score": row.quality_score,
            "allowed_use": row.allowed_use or ["qual_report", "quant_report", "citation"],
            "citation_metadata": row.citation_metadata or {},
            "content_hash": row.chunk_content_hash,
        })
    
    return chunks


def _stable_point_id(chunk_id: str) -> int:
    digest = hashlib.sha256(str(chunk_id).encode("utf-8")).hexdigest()
    return int(digest[:16], 16) % (10**15)


def _content_hash(content: str) -> str:
    return hashlib.sha256((content or "").encode("utf-8")).hexdigest()


def _as_json_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        return [part.strip() for part in value.split(",") if part.strip()]
    return [value]


def _as_json_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


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
        point_id = _stable_point_id(chunk["chunk_id"])
        content_hash = chunk.get("content_hash") or _content_hash(chunk["content"])
        
        payload = {
            "chunk_id": chunk["chunk_id"],  # Keep original ID in payload
            "document_id": chunk["document_id"],
            "document_title": chunk["document_title"],
            "source_type": chunk["source_type"],
            "source_url": chunk["source_url"],
            "domain": chunk["domain"],
            "exploration_id": chunk.get("exploration_id"),
            "registry_id": chunk.get("registry_id"),
            "source_group": chunk.get("source_group"),
            "source_keywords": _as_json_list(chunk.get("source_keywords")),
            "approval_status": chunk.get("approval_status") or "approved",
            "authority_tier": chunk.get("authority_tier") or "user_uploaded",
            "quality_score": chunk.get("quality_score"),
            "allowed_use": _as_json_list(chunk.get("allowed_use")),
            "citation_metadata": _as_json_dict(chunk.get("citation_metadata")),
            "chunk_index": chunk["chunk_index"],
            "data_type": chunk["data_type"] or "text",
            "content_hash": content_hash,
            "embedding_model": settings.EMBEDDING_MODEL,
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
        print("\nFetching unembedded chunks from sync_source.content_chunk...")
        chunks = await get_chunks_from_db(session, limit)

        total = len(chunks)
        print(f"Found {total:,} pending chunks to embed")

        if total == 0:
            print("\n✅ No pending chunks — all sources already embedded.")
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
