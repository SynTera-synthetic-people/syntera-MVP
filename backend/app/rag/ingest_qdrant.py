"""
Upload embeddings to Qdrant Cloud
"""

import asyncio
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from tqdm import tqdm

from app.config import settings
from .embed_worker import embed_all_chunks



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
    print("\n[STEP 1/2] Creating embeddings from sync_source.content_chunk...")
    points = await embed_all_chunks(limit=limit)
    
    if not points:
        print("\n❌ No points to upload!")
        print("Make sure sync_source.content_chunk has data.")
        return
    
    # Step 2: Upload to Qdrant
    print("\n[STEP 2/2] Uploading to Qdrant Cloud...")
    create_collection_if_not_exists()
    upsert_points(points)
    
    # Get collection stats
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