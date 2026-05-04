from pydantic import BaseModel, ConfigDict

class OrgRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
