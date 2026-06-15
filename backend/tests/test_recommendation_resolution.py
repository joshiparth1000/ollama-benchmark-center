from datetime import UTC, datetime

import pytest

from app.api.routes import _get_recommendation_record
from app.schemas.api import BenchmarkRunRead


class FakeRecommendation:
    def __init__(self, details):
        self.details = details


class FakeRepo:
    def __init__(self, existing, results):
        self.existing = existing
        self.results = results
        self.saved = None

    async def get_recommendation(self, run_id):
        return self.existing

    async def list_results(self, run_id):
        return self.results

    async def save_recommendation(self, run_id, config, metrics, reason, details):
        self.saved = {
            "run_id": run_id,
            "config": config,
            "metrics": metrics,
            "reason": reason,
            "details": details,
        }
        return self.saved


@pytest.mark.asyncio
async def test_get_recommendation_record_returns_existing_when_details_are_present():
    repo = FakeRepo(FakeRecommendation({"summary": "ready"}), [])

    result = await _get_recommendation_record(repo, "run-1")

    assert result.details == {"summary": "ready"}
    assert repo.saved is None


@pytest.mark.asyncio
async def test_get_recommendation_record_backfills_empty_details(monkeypatch):
    repo = FakeRepo(FakeRecommendation({}), [{"config": {"num_gpu": 1}, "metrics": {"gen_tps": 9}}])

    def fake_choose_recommendation(results):
        assert results == repo.results
        return {"num_gpu": 1}, {"gen_tps": 9}, "picked", {"summary": "filled"}

    monkeypatch.setattr("app.api.routes.choose_recommendation", fake_choose_recommendation)

    result = await _get_recommendation_record(repo, "run-2")

    assert result["details"] == {"summary": "filled"}
    assert repo.saved["run_id"] == "run-2"


def test_benchmark_run_read_includes_live_metadata_fields():
    payload = {
        "id": "run-1",
        "host_id": "host-1",
        "model": "llama3.2",
        "mode": "quick",
        "prompt": "hello",
        "status": "running",
        "agent_benchmark_id": "agent-run-1",
        "current_config": {"num_gpu": 1, "num_thread": 8},
        "progress": {"completed": 1, "status": "running"},
        "created_at": datetime.now(UTC),
        "updated_at": datetime.now(UTC),
    }

    run = BenchmarkRunRead.model_validate(payload)

    assert run.current_config == {"num_gpu": 1, "num_thread": 8}
    assert run.progress == {"completed": 1, "status": "running"}
