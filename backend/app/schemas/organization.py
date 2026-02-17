from pydantic import BaseModel

class OrgRead(BaseModel):
    id: str
    name: str

    class Config:
        orm_mode = True
