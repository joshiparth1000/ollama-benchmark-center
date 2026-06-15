import pytest

from app.api.routes import _get_recommendation_record


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

