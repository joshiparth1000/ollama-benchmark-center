from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import BenchmarkResult, BenchmarkRun, Export, Recommendation
from app.schemas.api import BenchmarkRunCreate


class BenchmarkRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_runs(self) -> list[BenchmarkRun]:
        return list((await self.session.scalars(select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc()))).all())

    async def get_run(self, run_id: str) -> BenchmarkRun | None:
        return await self.session.get(BenchmarkRun, run_id)

    async def create_run(self, payload: BenchmarkRunCreate) -> BenchmarkRun:
        run = BenchmarkRun(
            host_id=payload.host_id,
            model=payload.model,
            mode=payload.mode,
            prompt=payload.prompt,
            status="queued",
        )
        self.session.add(run)
        await self.session.commit()
        await self.session.refresh(run)
        return run

    async def update_run(self, run: BenchmarkRun, **values: object) -> BenchmarkRun:
        for key, value in values.items():
            setattr(run, key, value)
        run.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(run)
        return run

    async def delete_run(self, run: BenchmarkRun) -> None:
        await self.session.execute(delete(BenchmarkResult).where(BenchmarkResult.run_id == run.id))
        await self.session.execute(delete(Recommendation).where(Recommendation.run_id == run.id))
        await self.session.execute(delete(Export).where(Export.run_id == run.id))
        await self.session.delete(run)
        await self.session.commit()

    async def replace_results(self, run_id: str, results: list[dict]) -> list[BenchmarkResult]:
        await self.session.execute(delete(BenchmarkResult).where(BenchmarkResult.run_id == run_id))
        await self.session.execute(delete(Recommendation).where(Recommendation.run_id == run_id))
        await self.session.execute(delete(Export).where(Export.run_id == run_id))
        rows: list[BenchmarkResult] = []
        for result in results:
            metrics = result.get("metrics", {})
            row = BenchmarkResult(
                run_id=run_id,
                config=result.get("config", {}),
                metrics=metrics,
                status=result.get("status", "completed"),
                error=result.get("error"),
                gen_tps=metrics.get("gen_tps"),
                latency_seconds=metrics.get("total_sec"),
                max_vram_used_mb=metrics.get("max_vram_used_mb"),
            )
            self.session.add(row)
            rows.append(row)
        await self.session.commit()
        return rows

    async def list_results(self, run_id: str) -> list[BenchmarkResult]:
        stmt = select(BenchmarkResult).where(BenchmarkResult.run_id == run_id)
        return list((await self.session.scalars(stmt)).all())

    async def save_recommendation(
        self,
        run_id: str,
        config: dict,
        metrics: dict,
        reason: str,
        details: dict,
    ) -> Recommendation:
        recommendation = Recommendation(run_id=run_id, config=config, metrics=metrics, reason=reason, details=details)
        self.session.add(recommendation)
        await self.session.commit()
        await self.session.refresh(recommendation)
        return recommendation

    async def get_recommendation(self, run_id: str) -> Recommendation | None:
        stmt = select(Recommendation).where(Recommendation.run_id == run_id).order_by(Recommendation.created_at.desc())
        return (await self.session.scalars(stmt)).first()

    async def save_export(self, run_id: str, kind: str, content: str) -> Export:
        export = Export(run_id=run_id, kind=kind, content=content)
        self.session.add(export)
        await self.session.commit()
        await self.session.refresh(export)
        return export
