from pydantic import BaseModel
from typing import List
from datetime import datetime


class LLMUsageByStage(BaseModel):
    stage: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    call_count: int


class LLMUsageByModel(BaseModel):
    provider: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    call_count: int


class ExplorationLLMUsageOut(BaseModel):
    exploration_id: str
    total_input_tokens: int
    total_output_tokens: int
    total_tokens: int
    total_cost_usd: float
    # True when at least one llm_usage_event row in this exploration has
    # cost_usd IS NULL (unrecognized model in the rate table) — SQL SUM()
    # silently ignores NULLs, so every cost_usd above is a lower bound
    # whenever this is true, not a complete total.
    cost_usd_incomplete: bool
    call_count: int
    error_count: int
    by_stage: List[LLMUsageByStage]
    by_model: List[LLMUsageByModel]
    generated_at: datetime
