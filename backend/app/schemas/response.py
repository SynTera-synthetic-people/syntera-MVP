from typing import Optional, Any
from pydantic import BaseModel

class SuccessResponse(BaseModel):
    status: str = "success"
    message: str
    data: Optional[Any] = None

class DeleteResponse(BaseModel):
    status: str = "success"
    message: str
    
class ErrorResponse(BaseModel):
    status: str = "error"
    message: str
