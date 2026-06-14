from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import BenchmarkResult, BenchmarkRun, Export, HardwareSnapshot, Host, Recommendation
from app.schemas.api import HostCreate, HostUpdate


class HostRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self) -> list[Host]:
        return list((await self.session.scalars(select(Host).order_by(Host.created_at.desc()))).all())

    async def get(self, host_id: str) -> Host | None:
        return await self.session.get(Host, host_id)

    async def create(self, payload: HostCreate) -> Host:
        host = Host(name=payload.name, agent_url=str(payload.agent_url), status="unknown")
        self.session.add(host)
        await self.session.commit()
        await self.session.refresh(host)
        return host

    async def update(self, host: Host, payload: HostUpdate) -> Host:
        data = payload.model_dump(exclude_unset=True)
        for key, value in data.items():
            setattr(host, key, str(value) if key == "agent_url" else value)
        host.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(host)
        return host

    async def delete(self, host: Host) -> None:
        run_ids = list(
            (
                await self.session.scalars(
                    select(BenchmarkRun.id).where(BenchmarkRun.host_id == host.id)
                )
            ).all()
        )
        if run_ids:
            await self.session.execute(delete(Export).where(Export.run_id.in_(run_ids)))
            await self.session.execute(delete(Recommendation).where(Recommendation.run_id.in_(run_ids)))
            await self.session.execute(delete(BenchmarkResult).where(BenchmarkResult.run_id.in_(run_ids)))
            await self.session.execute(delete(BenchmarkRun).where(BenchmarkRun.id.in_(run_ids)))
        await self.session.execute(delete(HardwareSnapshot).where(HardwareSnapshot.host_id == host.id))
        await self.session.delete(host)
        await self.session.commit()

    async def add_snapshot(self, host_id: str, payload: dict) -> HardwareSnapshot:
        snapshot = HardwareSnapshot(host_id=host_id, payload=payload)
        self.session.add(snapshot)
        await self.session.commit()
        await self.session.refresh(snapshot)
        return snapshot

    async def latest_snapshot(self, host_id: str) -> HardwareSnapshot | None:
        stmt = (
            select(HardwareSnapshot)
            .where(HardwareSnapshot.host_id == host_id)
            .order_by(HardwareSnapshot.created_at.desc())
        )
        return (await self.session.scalars(stmt)).first()
