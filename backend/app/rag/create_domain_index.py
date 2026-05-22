"""
Create keyword index on domain field for filtering
"""

from qdrant_client import QdrantClient
from qdrant_client.models import PayloadSchemaType

from app.config import settings

# Initialize Qdrant client
client = QdrantClient(
    url=settings.QDRANT_URL,
    api_key=settings.QDRANT_API_KEY,
)

print("="*70)
print("CREATING DOMAIN INDEX IN QDRANT")
print("="*70)

# Create keyword index on 'domain' field
client.create_payload_index(
    collection_name=settings.QDRANT_COLLECTION_NAME,
    field_name="domain",
    field_schema=PayloadSchemaType.KEYWORD
)

print(f"\n✅ Created keyword index on 'domain' field")
print(f"   Collection: {settings.QDRANT_COLLECTION_NAME}")
print("\nYou can now filter by domain in your queries!")