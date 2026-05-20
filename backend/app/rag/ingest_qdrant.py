"""
Upload embeddings to Qdrant Cloud and write status back to Postgres.
"""

import asyncio
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from sqlalchemy import text
from tqdm import tqdm

from app.config import settings
from app.db import AsyncSessionLocal
from .embed_worker import embed_all_chunks

_WRITEBACK_BATCH = 500



# Initialize Qdrant client
client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)


def create_collection_if_not_exists():
    """
    Create Qdrant collection if it doesn't exist
    """
    collection_name = settings.QDRANT_COLLECTION_NAME
    
    # Check if collection exists
    collections = client.get_collections().collections
    collection_names = [c.name for c in collections]
    
    if collection_name not in collection_names:
        print(f"Creating new Qdrant collection: {collection_name}")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=settings.EMBEDDING_DIMENSIONS,
                distance=Distance.COSINE
            )
        )
        print("✅ Collection created!")
    else:
        print(f"✅ Collection '{collection_name}' already exists")


def upsert_points(points: list):
    """
    Upload points to Qdrant in batches
    """
    collection_name = settings.QDRANT_COLLECTION_NAME
    batch_size = settings.UPSERT_BATCH_SIZE
    
    print(f"\nUploading {len(points):,} points to Qdrant...")
    
    for i in tqdm(range(0, len(points), batch_size), desc="Uploading"):
        batch = points[i:i+batch_size]
        
        # Convert to PointStruct format
        qdrant_points = [
            PointStruct(
                id=point["id"],
                vector=point["vector"],
                payload=point["payload"]
            )
            for point in batch
        ]
        
        # Upsert batch
        client.upsert(
            collection_name=collection_name,
            points=qdrant_points
        )
    
    print("✅ Upload complete!")


async def write_back_embedded_status(points: list) -> None:
    """
    After Qdrant upsert, mark chunks as embedded in Postgres.

    Two updates per batch:
    - content_chunk: embedding_status = 'done', qdrant_point_id = <str(point_id)>
    - document:      index_status = 'indexed', indexed_at = now()
    """
    if not points:
        return

    chunk_ids: list[str] = []
    qdrant_ids: list[str] = []
    doc_ids: set[str] = set()

    for point in points:
        payload = point["payload"]
        cid = payload.get("chunk_id")
        did = payload.get("document_id")
        if cid:
            chunk_ids.append(str(cid))
            qdrant_ids.append(str(point["id"]))
        if did:
            doc_ids.add(str(did))

    async with AsyncSessionLocal() as session:
        # Batch-update chunks using unnest for efficiency
        for i in range(0, len(chunk_ids), _WRITEBACK_BATCH):
            c_batch = chunk_ids[i : i + _WRITEBACK_BATCH]
            q_batch = qdrant_ids[i : i + _WRITEBACK_BATCH]
            await session.execute(
                text("""
                    UPDATE sync_source.content_chunk
                    SET embedding_status = 'done',
                        qdrant_point_id   = data.qid
                    FROM (
                        SELECT unnest(:cids::text[]) AS cid,
                               unnest(:qids::text[]) AS qid
                    ) AS data
                    WHERE id = data.cid
                """),
                {"cids": c_batch, "qids": q_batch},
            )

        # Mark all affected documents as indexed
        if doc_ids:
            await session.execute(
                text("""
                    UPDATE sync_source.document
                    SET index_status = 'indexed',
                        indexed_at   = now()
                    WHERE id = ANY(:doc_ids)
                    AND index_status != 'indexed'
                """),
                {"doc_ids": list(doc_ids)},
            )

        await session.commit()

    print(f"✅ Write-back: {len(chunk_ids)} chunks → 'done', {len(doc_ids)} documents → 'indexed'")


async def ingest_to_qdrant(limit: int = None):
    """
    Main ingestion pipeline:
    1. Create embeddings from PostgreSQL chunks
    2. Upload to Qdrant Cloud
    
    Args:
        limit: Limit number of chunks (None = all chunks)
    """
    print("="*70)
    print("SOURCEBANK RAG - QDRANT INGESTION")
    print("="*70)
    
    # Step 1: Create embeddings
    print("\n[STEP 1/3] Creating embeddings from sync_source.content_chunk...")
    points = await embed_all_chunks(limit=limit)
    
    if not points:
        print("\n✅ Nothing to ingest — no pending chunks found.")
        return
    
    # Step 2: Upload to Qdrant
    print("\n[STEP 2/3] Uploading to Qdrant Cloud...")
    create_collection_if_not_exists()
    upsert_points(points)

    # Step 3: Write status back to Postgres
    print("\n[STEP 3/3] Writing embedding status back to Postgres...")
    await write_back_embedded_status(points)

    # Collection stats
    collection_info = client.get_collection(settings.QDRANT_COLLECTION_NAME)
    print(f"\n📊 Qdrant Collection Stats:")
    print(f"   Collection: {settings.QDRANT_COLLECTION_NAME}")
    print(f"   Total points: {collection_info.points_count:,}")
    print(f"   Vector size: {collection_info.config.params.vectors.size}")
    print(f"   Distance: {collection_info.config.params.vectors.distance}")

    print("\n" + "="*70)
    print("✅ INGESTION COMPLETE!")
    print("="*70)
    print("\nNext steps:")
    print("  1. Test retrieval: python -m app.rag.retrieve")
    print("  2. Run full test: python -m app.rag.test_rag")


if __name__ == "__main__":
    import sys
    
    # Get limit from command line (optional)
    # Usage: python -m app.rag.ingest_qdrant [limit]
    # Example: python -m app.rag.ingest_qdrant 100
    limit = None
    if len(sys.argv) > 1:
        try:
            limit = int(sys.argv[1])
            print(f"\n🧪 Running with limit={limit}")
        except ValueError:
            print(f"\n⚠️  Invalid limit: {sys.argv[1]}, using no limit")
    else:
        print("\n🚀 Running FULL ingestion (no limit)")
        print("   To test with limit: python -m app.rag.ingest_qdrant 100")
    
    asyncio.run(ingest_to_qdrant(limit=limit))