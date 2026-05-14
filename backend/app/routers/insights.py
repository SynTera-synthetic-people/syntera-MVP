"""
Unified insights endpoint - routes to ML or RAG
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import time

from app.services.query_router import route_query, QueryType
from app.rag.test_rag import generate_answer
from app.ml.predictor import predict_user_behavior, VALID_DOMAINS

router = APIRouter(prefix="/insights", tags=["insights"])


class QueryRequest(BaseModel):
    query: str
    user_id: str = None
    domain: str = None


class Source(BaseModel):
    title: str
    domain: str
    relevance: str
    preview: str = None


class InsightsResponse(BaseModel):
    query: str
    route: str  # "ml" or "rag"
    answer: str = None
    sources: list[Source] = []
    prediction: float = None
    confidence: float = None
    processing_time: float = None


@router.post("/query", response_model=InsightsResponse)
async def query_insights(request: QueryRequest):
    """
    Unified insights endpoint
    
    Routes query to:
    - RAG: For "why", "how", "what influences" questions
    - ML: For "predict", "will", "how many" questions (requires user_id)
    
    Examples:
    - "Why do consumers prefer Swiggy?" → RAG
    - "Will user123 order next week?" → ML
    """
    start_time = time.time()
    
    # Route query
    query_type = route_query(request.query, request.user_id)
    
    try:
        # RAG Path
        if query_type == QueryType.RAG_INSIGHTS:
            print(f"🔍 Routing to RAG: {request.query}")
            
            rag_result = generate_answer(
                request.query,
                domain=request.domain,
                model="gpt-4o-mini"
            )
            
            # Format sources
            sources = [
                Source(
                    title=s["title"],
                    domain=s["domain"],
                    relevance=s["relevance"],
                    preview=s.get("preview", "")
                )
                for s in rag_result.get("sources", [])
            ]
            
            return InsightsResponse(
                query=request.query,
                route="rag",
                answer=rag_result["answer"],
                sources=sources,
                processing_time=time.time() - start_time
            )
        
        # ML Path
        else:
            print(f"🤖 Routing to ML: {request.query}")

            if not request.user_id:
                raise HTTPException(
                    status_code=400,
                    detail="user_id required for ML predictions"
                )

            domain = (request.domain or "").lower() or None
            if domain not in VALID_DOMAINS:
                raise HTTPException(
                    status_code=400,
                    detail=f"A valid domain is required for ML predictions. "
                           f"Pass one of: {', '.join(sorted(VALID_DOMAINS))}"
                )

            try:
                ml_result = await predict_user_behavior(request.user_id, domain)
            except ValueError as e:
                raise HTTPException(status_code=404, detail=str(e))

            return InsightsResponse(
                query=request.query,
                route="ml",
                answer=ml_result["explanation"],
                prediction=ml_result["prediction"],
                confidence=ml_result["confidence"],
                processing_time=time.time() - start_time
            )
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing query: {str(e)}"
        )


@router.get("/health")
async def health_check():
    """
    Check system health
    """
    from app.ml.predictor import MODELS_SAVED_DIR
    import os
    ml_ready = os.path.isdir(MODELS_SAVED_DIR) and any(
        f.endswith(".joblib") for f in os.listdir(MODELS_SAVED_DIR)
    )
    return {
        "status": "healthy",
        "rag_available": True,
        "ml_available": ml_ready,
        "ml_note": "DB feature extraction pending — models loaded, predictions need user features",
        "timestamp": time.time()
    }


@router.get("/examples")
async def get_examples():
    """
    Get example queries for testing
    """
    return {
        "rag_queries": [
            "What influences consumer trust in online shopping?",
            "How do millennials make purchasing decisions?",
            "What factors affect food delivery platform choice?",
            "What are key trends in ecommerce consumer behavior?",
            "Why do consumers prefer certain ride-sharing apps?"
        ],
        "ml_queries": [
            "Will this user order next week?",
            "How many times will user order this month?",
            "Predict user's next purchase date"
        ]
    }