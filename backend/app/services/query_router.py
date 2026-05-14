"""
Route queries to ML or RAG based on query type
"""

from enum import Enum


class QueryType(Enum):
    ML_PREDICTION = "ml"
    RAG_INSIGHTS = "rag"


def route_query(query: str, user_id: str = None) -> QueryType:
    """
    Decide if query needs ML prediction or RAG insights
    
    Args:
        query: User's question
        user_id: User identifier (required for ML predictions)
    
    Returns:
        QueryType.ML_PREDICTION or QueryType.RAG_INSIGHTS
    """
    query_lower = query.lower()
    
    # ML prediction keywords
    ml_keywords = [
        'predict', 'forecast', 'will', 'when will',
        'how many', 'how much', 'next week', 'next month',
        'likely to', 'probability', 'chance of'
    ]
    
    # If user_id provided and query has ML keywords
    if user_id and any(kw in query_lower for kw in ml_keywords):
        return QueryType.ML_PREDICTION
    else:
        # Default to RAG for insights, research, behavioral questions
        return QueryType.RAG_INSIGHTS