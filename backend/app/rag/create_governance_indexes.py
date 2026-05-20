from app.config import settings
from qdrant_client import QdrantClient
from qdrant_client.models import PayloadSchemaType

client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)

fields = [
    "source_group",
    "approval_status",
    "authority_tier",
    "exploration_id",
    "registry_id",
]

for field in fields:
    client.create_payload_index(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        field_name=field,
        field_schema=PayloadSchemaType.KEYWORD,
    )
    print(f"✅ Index created: {field}")