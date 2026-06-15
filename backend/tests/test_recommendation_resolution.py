from datetime import UTC, datetime

import httpx
import pytest

from app.api.routes import _get_recommendation_record, check_host_status, delete_benchmark_run
from app.schemas.api import BenchmarkRunRead
from app.services.recommendations import RECOMMENDATION_VERSION


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
    repo = FakeRepo(
        FakeRecommendation({"recommendation_version": RECOMMENDATION_VERSION, "summary": "ready"}),
        [],
    )

    result = await _get_recommendation_record(repo, "run-1")

    assert result.details == {"recommendation_version": RECOMMENDATION_VERSION, "summary": "ready"}
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


@pytest.mark.asyncio
async def test_get_recommendation_record_recomputes_stale_recommendation(monkeypatch):
    repo = FakeRepo(FakeRecommendation({"summary": "old cpu recommendation"}), [{"config": {"num_gpu": -1}, "metrics": {"gen_tps": 9}}])

    def fake_choose_recommendation(results):
        assert results == repo.results
        return (
            {"num_gpu": -1},
            {"gen_tps": 9},
            "picked gpu",
            {"recommendation_version": RECOMMENDATION_VERSION, "summary": "fresh gpu recommendation"},
        )

    monkeypatch.setattr("app.api.routes.choose_recommendation", fake_choose_recommendation)

    result = await _get_recommendation_record(repo, "run-3")

    assert result["config"] == {"num_gpu": -1}
    assert result["details"]["recommendation_version"] == RECOMMENDATION_VERSION
    assert repo.saved["reason"] == "picked gpu"


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


@pytest.mark.asyncio
async def test_delete_benchmark_run_cancels_active_agent_run_and_deletes(monkeypatch):
    class FakeRun:
        id = "run-1"
        host_id = "host-1"
        status = "running"
        agent_benchmark_id = "agent-run-1"

    class FakeHost:
        agent_url = "http://agent:9000"

    class FakeBenchmarkRepo:
        deleted = None

        def __init__(self, session):
            self.session = session

        async def get_run(self, run_id):
            assert run_id == "run-1"
            return FakeRun()

        async def delete_run(self, run):
            self.deleted = run.id
            FakeBenchmarkRepo.deleted = run.id

    class FakeHostRepo:
        def __init__(self, session):
            self.session = session

        async def get(self, host_id):
            assert host_id == "host-1"
            return FakeHost()

    class FakeAgentClient:
        cancelled = None

        def __init__(self, agent_url):
            assert agent_url == "http://agent:9000"

        async def cancel_benchmark(self, benchmark_id):
            FakeAgentClient.cancelled = benchmark_id

    monkeypatch.setattr("app.api.routes.BenchmarkRepository", FakeBenchmarkRepo)
    monkeypatch.setattr("app.api.routes.HostRepository", FakeHostRepo)
    monkeypatch.setattr("app.api.routes.AgentClient", FakeAgentClient)

    await delete_benchmark_run("run-1", session=object())

    assert FakeAgentClient.cancelled == "agent-run-1"
    assert FakeBenchmarkRepo.deleted == "run-1"


@pytest.mark.asyncio
async def test_check_host_status_marks_agent_offline(monkeypatch):
    class FakeHost:
        id = "host-1"
        agent_url = "http://agent:9000"

    class FakeHostRepo:
        saved_status = None

        def __init__(self, session):
            self.session = session

        async def get(self, host_id):
            assert host_id == "host-1"
            return FakeHost()

        async def update(self, host, payload):
            FakeHostRepo.saved_status = payload.status
            host.status = payload.status
            return host

    class FakeAgentClient:
        def __init__(self, agent_url):
            assert agent_url == "http://agent:9000"

        async def get_health(self):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr("app.api.routes.HostRepository", FakeHostRepo)
    monkeypatch.setattr("app.api.routes.AgentClient", FakeAgentClient)

    host = await check_host_status("host-1", session=object())

    assert host.status == "offline"
    assert FakeHostRepo.saved_status == "offline"
