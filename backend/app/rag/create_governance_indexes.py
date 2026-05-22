from app.config import settings
from qdrant_client import QdrantClient
from qdrant_client.models import PayloadSchemaType

_FIELDS = [
    # Core governance fields — must match _build_filter() in retrieve.py
    "source_group",
    "approval_status",
    "authority_tier",
    "exploration_id",
    "registry_id",
    # Access-use field (array of strings: qual_report / quant_report / citation).
    # Index is created here so it is ready when per-use filtering is enabled.
    "allowed_use",
    # Domain field — also filtered in _build_filter(); was previously only created
    # by the standalone create_domain_index.py script (not wired to startup).
    "domain",
]


def create_governance_indexes() -> None:
    client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
    for field in _FIELDS:
        client.create_payload_index(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            field_name=field,
            field_schema=PayloadSchemaType.KEYWORD,
        )
        print(f"✅ Index verified/created: {field}")


if __name__ == "__main__":
    create_governance_indexes()
