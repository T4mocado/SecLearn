"""The LLM clients and the `generate` / `filter` commands, with the network replaced by a mock transport.

No test reaches a real API: Claude and Gemini SDK clients are built for real, but their HTTP goes to `MockTransport`.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import httpx2
import pytest
from conftest import MINI

from seclearn_eval import cli
from seclearn_eval.clusters import build_cluster_map
from seclearn_eval.io import read_json, read_jsonl, read_questions, write_json, write_jsonl
from seclearn_eval.llm import ClaudeClient, GeminiClient, LLMError, ModelRefusal, make_clients
from seclearn_eval.schema import Candidate, FilterReport, GenerationReport, LLMConfig, ModelRef, PlanSlot, SamplePlan
from seclearn_eval.snapshot import load_snapshot
from seclearn_eval.units import build_units

SENTINEL_CLAUDE = "sk-ant-test-SENTINEL-0123456789"
SENTINEL_GEMINI = "AIza-test-SENTINEL-9876543210"
ENV = {"ANTHROPIC_API_KEY": SENTINEL_CLAUDE, "GEMINI_API_KEY": SENTINEL_GEMINI}


def test_config_refuses_deepseek_and_any_key_field():
    with pytest.raises(ValueError, match="DeepSeek"):
        ModelRef(provider="claude", model="deepseek-chat")
    with pytest.raises(ValueError):
        ModelRef(provider="deepseek", model="deepseek-chat")
    base = {"generator": {"provider": "claude", "model": "m"}, "judge": {"provider": "gemini", "model": "g"}, "embedder": {"provider": "gemini", "model": "e"}}
    LLMConfig.model_validate(base)
    with pytest.raises(ValueError):
        LLMConfig.model_validate({**base, "api_key": "sk-…"})
    with pytest.raises(ValueError):
        LLMConfig.model_validate({**base, "judge": {"provider": "gemini", "model": "g", "api_key": "x"}})


def test_the_checked_in_config_pins_claude_and_gemini():
    config = read_json(Path(__file__).parents[1] / "llm-config.json", LLMConfig)
    assert config.generator.provider == "claude" and config.judge.provider == "gemini"
    assert config.oversample == 1.6


def test_a_missing_key_names_the_variable_not_a_value():
    with pytest.raises(LLMError, match="ANTHROPIC_API_KEY"):
        ClaudeClient("claude-x", env={})
    with pytest.raises(LLMError, match="GEMINI_API_KEY"):
        GeminiClient("gemini-x", env={})


class FakeAPIs:
    """Plays api.anthropic.com and generativelanguage.googleapis.com; records requests."""

    def __init__(self, claude_items: list[dict] | None = None, claude_stop: str = "end_turn"):
        self.requests: list[httpx.Request] = []
        self.claude_items = claude_items or []
        self.claude_stop = claude_stop

    def respond(self, request) -> dict:
        self.requests.append(request)
        body = json.loads(request.content or b"{}")
        if request.url.host == "api.anthropic.com":
            text = json.dumps({"items": self.claude_items})
            return {
                "id": "msg_1", "type": "message", "role": "assistant", "model": body["model"],
                "content": [{"type": "text", "text": text}], "stop_reason": self.claude_stop, "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }
        if "embedContent" in request.url.path or "batchEmbedContents" in request.url.path:
            n = len(body.get("requests", [])) or 1
            return {"embeddings": [{"values": [1.0, float(i)]} for i in range(n)]}
        reply = {"answerable": True, "answer": "…", "level": "L6"}
        return {"candidates": [{"content": {"role": "model", "parts": [{"text": json.dumps(reply)}]}, "finishReason": "STOP"}]}

    def client(self, provider: str):
        # The Claude SDK is built on httpx2, the Gemini SDK on httpx.
        if provider == "claude":
            return httpx2.Client(transport=httpx2.MockTransport(lambda r: httpx2.Response(200, json=self.respond(r))))
        return httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=self.respond(r))))

    def clients(self) -> dict:
        return {p: self.client(p) for p in ("claude", "gemini")}


def test_a_gemini_api_error_is_an_llm_error_naming_the_model():
    # Google retired gemini-2.5-pro for new users with a 404; the CLI should say so in one line, not a traceback.
    gone = {"error": {"code": 404, "message": "This model models/gemini-2.5-pro is no longer available.", "status": "NOT_FOUND"}}
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404, json=gone)))
    client = GeminiClient("gemini-2.5-pro", env=ENV, http_client=http)
    with pytest.raises(LLMError, match=r"gemini-2\.5-pro: 404 .*no longer available"):
        client.ask_json("q", {"type": "object"})
    with pytest.raises(LLMError, match="404"):
        client.embed(["a"])


def test_claude_client_sends_the_key_from_env_and_asks_for_json_schema():
    apis = FakeAPIs([{"x": 1}])
    client = ClaudeClient("claude-opus-5-5", env=ENV, http_client=apis.client("claude"))
    schema = {"type": "object", "properties": {"items": {"type": "array"}}, "required": ["items"], "additionalProperties": False}
    assert client.ask_json("hello", schema, system="sys") == {"items": [{"x": 1}]}
    [req] = apis.requests
    assert req.headers["x-api-key"] == SENTINEL_CLAUDE
    body = json.loads(req.content)
    assert body["model"] == "claude-opus-5-5" and body["system"] == "sys"
    assert body["output_config"] == {"format": {"type": "json_schema", "schema": schema}}


def test_a_claude_refusal_is_a_refusal_and_a_cut_reply_is_not():
    schema = {"type": "object"}
    refusing = ClaudeClient("claude-opus-5-5", env=ENV, http_client=FakeAPIs([], "refusal").client("claude"))
    with pytest.raises(ModelRefusal, match="refusal"):
        refusing.ask_json("q", schema)
    cut = ClaudeClient("claude-opus-5-5", env=ENV, http_client=FakeAPIs([], "max_tokens").client("claude"))
    with pytest.raises(LLMError, match="max_tokens") as err:
        cut.ask_json("q", schema)
    assert not isinstance(err.value, ModelRefusal)


def test_generate_command_reports_refused_slots_and_writes_its_files(files, monkeypatch, capsys):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    apis = FakeAPIs([], "refusal")
    monkeypatch.setattr(cli, "make_clients", lambda config, cache: make_clients(config, cache, http_clients=apis.clients()))
    root = files["root"]
    argv = ["generate", "--snapshot", str(MINI), "--units", str(files["units"]), "--config", str(files["config"])]
    assert cli.main([*argv, "--cache", str(root / "cache"), "--plan", str(files["plan"]), "--out", str(root / "candidates.jsonl")]) == 0
    assert read_jsonl(root / "candidates.jsonl", Candidate) == []
    report = read_json(root / "generate-report.json", GenerationReport)
    assert report.n_refused == 2 and {r.slot_id for r in report.refused} == {"test-00001", "test-00002"}
    out = capsys.readouterr().out
    assert "refused" in out and "Session_Management_Cheat_Sheet#s01" in out


def test_a_dropped_gemini_connection_is_retried_then_an_llm_error(monkeypatch):
    # A real filter run died on "Server disconnected without sending a response" after hundreds of good calls.
    monkeypatch.setattr(GeminiClient, "RETRY_WAIT", 0.0)
    apis, drops = FakeAPIs(), [2]

    def flaky(request):
        if drops[0]:
            drops[0] -= 1
            raise httpx.RemoteProtocolError("Server disconnected without sending a response.", request=request)
        return httpx.Response(200, json=apis.respond(request))

    client = GeminiClient("gemini-3.8-flash", env=ENV, http_client=httpx.Client(transport=httpx.MockTransport(flaky)))
    assert client.ask_json("q", {"type": "object"})["answerable"] is True
    drops[0] = 10**6
    with pytest.raises(LLMError, match=r"gemini-3\.8-flash: .*Server disconnected"):
        client.ask_json("q", {"type": "object"})
    with pytest.raises(LLMError, match="Server disconnected"):
        client.embed(["a"])


def test_a_gemini_server_error_is_retried_then_an_llm_error(monkeypatch):
    # The pool's judge run died on one "502 ... Please try again in 30 seconds" after 2892 good calls.
    monkeypatch.setattr(GeminiClient, "RETRY_WAIT", 0.0)
    apis, fails = FakeAPIs(), [2]
    bad = {"error": {"code": 502, "message": "Server Error", "status": "UNAVAILABLE"}}

    def flaky(request):
        if fails[0]:
            fails[0] -= 1
            return httpx.Response(502, json=bad)
        return httpx.Response(200, json=apis.respond(request))

    client = GeminiClient("gemini-3.8-flash", env=ENV, http_client=httpx.Client(transport=httpx.MockTransport(flaky)))
    assert client.ask_json("q", {"type": "object"})["answerable"] is True
    fails[0] = 10**6
    with pytest.raises(LLMError, match=r"gemini-3\.8-flash: 502 .*after 5 tries"):
        client.ask_json("q", {"type": "object"})


def test_gemini_client_sends_the_key_from_env_json_mode_and_embeds():
    apis = FakeAPIs()
    client = GeminiClient("gemini-2.5-pro", env=ENV, http_client=apis.client("gemini"))
    assert client.ask_json("q", {"type": "object"}, seed=7)["answerable"] is True
    req = apis.requests[0]
    assert req.headers["x-goog-api-key"] == SENTINEL_GEMINI
    config = json.loads(req.content)["generationConfig"]
    assert config["responseMimeType"] == "application/json" and config["seed"] == 7
    assert GeminiClient("gemini-embedding-001", env=ENV, http_client=apis.client("gemini")).embed(["a", "b"]) == [[1.0, 0.0], [1.0, 1.0]]


# --- The commands, end to end ------------------------------------------------------------------------


@pytest.fixture
def files(tmp_path: Path) -> dict[str, Path]:
    snap = load_snapshot(MINI)
    units = tmp_path / "units.jsonl"
    write_jsonl(units, build_units(snap, build_cluster_map(snap.manifest))[0])
    plan = tmp_path / "plan.json"
    slots = [
        PlanSlot(slot_id="test-00001", split="test", cluster="auth", level="L1", doc_key="Session_Management_Cheat_Sheet", unit_ids=["Session_Management_Cheat_Sheet#s01"]),
        PlanSlot(slot_id="test-00002", split="test", cluster=None, level="L6", l6_kind="out_of_domain", doc_key=None, unit_ids=[]),
    ]
    write_json(plan, SamplePlan(snapshot_id="2026-10-18-mini", seed=5, params={}, cells=[], slots=slots))
    config = tmp_path / "llm-config.json"
    write_json(config, LLMConfig(
        generator=ModelRef(provider="claude", model="claude-opus-5-5"),
        judge=ModelRef(provider="gemini", model="gemini-2.5-pro"),
        embedder=ModelRef(provider="gemini", model="gemini-embedding-001"),
    ))
    return {"units": units, "plan": plan, "config": config, "root": tmp_path}


def _run(files: dict[str, Path], apis: FakeAPIs, monkeypatch) -> None:
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(cli, "make_clients", lambda config, cache: make_clients(config, cache, http_clients=apis.clients()))
    root = files["root"]
    common = ["--snapshot", str(MINI), "--units", str(files["units"]), "--config", str(files["config"]), "--cache", str(root / "cache")]
    assert cli.main(["generate", *common, "--plan", str(files["plan"]), "--out", str(root / "candidates.jsonl")]) == 0
    assert cli.main(["filter", *common, "--candidates", str(root / "candidates.jsonl"), "--out", str(root / "filtered.jsonl"), "--report", str(root / "report.json")]) == 0


def test_generate_then_filter_writes_files_and_reruns_from_cache_without_any_request(files, monkeypatch):
    item = {"claims": [], "question": "Món phở nấu thế nào?", "question_en": "How is pho cooked?", "answer": "", "quotes": []}
    apis = FakeAPIs([item, {**item, "question": "Thủ đô của Pháp?", "question_en": "Capital of France?"}])
    _run(files, apis, monkeypatch)
    root = files["root"]
    candidates = read_jsonl(root / "candidates.jsonl", Candidate)
    assert {c.slot_id for c in candidates} == {"test-00001", "test-00002"}
    report = read_json(root / "report.json", FilterReport)
    # The L1 candidates carry no quote, so step 1 rejects them; the L6(a) ones go through.
    assert report.steps[0].reasons == {"no_quote": 2}
    header, questions = read_questions(root / "filtered.jsonl")
    assert header.canary == load_snapshot(MINI).manifest.canary
    assert {q.strata.l6_kind for q in questions} == {"out_of_domain"}

    n = len(apis.requests)
    assert n > 0
    _run(files, apis, monkeypatch)
    assert len(apis.requests) == n


def test_no_api_key_reaches_any_file_the_commands_write(files, monkeypatch):
    apis = FakeAPIs([{"claims": [], "question": "Q?", "question_en": "Q?", "answer": "", "quotes": []}])
    _run(files, apis, monkeypatch)
    # The keys were used (they left in request headers) …
    assert any(r.headers.get("x-api-key") == SENTINEL_CLAUDE for r in apis.requests)
    assert any(r.headers.get("x-goog-api-key") == SENTINEL_GEMINI for r in apis.requests)
    # … but no file under the run's directory, cache included, holds them.
    written = [p for p in files["root"].rglob("*") if p.is_file()]
    assert any("cache" in p.parts for p in written)
    for p in written:
        text = p.read_bytes().decode("utf-8", errors="replace")
        assert SENTINEL_CLAUDE not in text and SENTINEL_GEMINI not in text, p
