from sqlmodel import select
from app.models.organization import Organization
from app.models.workspace import Workspace
from app.db import async_engine
from sqlalchemy.ext.asyncio import AsyncSession

async def create_organization_for_user(user, name="My Organization"):
    async with AsyncSession(async_engine) as session:
        org = Organization(name=name, owner_id=user.id)
        session.add(org)
        await session.commit()
        await session.refresh(org)
        return org


async def get_organization_by_owner(owner_id: str):
    async with AsyncSession(async_engine) as session:
        getOrganizationByOwner = select(Organization).where(Organization.owner_id == owner_id)
        response = await session.execute(getOrganizationByOwner)
        return response.scalars().first()


async def get_organization_by_workspace_id(workspace_id: str):
    async with AsyncSession(async_engine) as session:
        getOrganizationByWorkspace = (
            select(Organization)
            .join(Workspace, Workspace.organization_id == Organization.id)
            .where(Workspace.id == workspace_id)
        )
        response = await session.execute(getOrganizationByWorkspace)
        return response.scalars().first()

