"""Claude and Gemini behind one small interface: send a prompt, get JSON back (or embeddings for dedup).

Keys come from the environment only (ANTHROPIC_API_KEY, GEMINI_API_KEY) and are never written to a file:
the cache stores the request (model, prompt, schema, seed) and the response, nothing else.
DeepSeek, the app's chat LLM, is refused by the config schema (spec: never used in the eval set).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from .schema import LLMConfig, ModelRef

ENV_KEYS = {"claude": "ANTHROPIC_API_KEY", "gemini": "GEMINI_API_KEY"}


class LLMError(Exception):
    """A missing key or an unusable reply."""


class LLMClient(Protocol):
    model: str

    def ask_json(self, prompt: str, schema: dict[str, Any], *, system: str = "", seed: int = 0) -> dict[str, Any]:
        """One request; the reply is a JSON object matching `schema`."""
        ...

    def embed(self, texts: list[str]) -> list[list[float]]:
        """One vector per text, for semantic dedup."""
        ...


# --- Fake (tests) ----------------------------------------------------------------------------------


@dataclass
class Call:
    kind: str
    prompt: str
    schema: dict[str, Any] | None = None
    system: str = ""
    seed: int = 0


@dataclass
class FakeClient:
    """Answers with `reply(prompt, schema)`; embeds with `embed_one(text)`. Records every call."""

    model: str
    reply: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None
    embed_one: Callable[[str], list[float]] | None = None
    calls: list[Call] = field(default_factory=list)

    def ask_json(self, prompt: str, schema: dict[str, Any], *, system: str = "", seed: int = 0) -> dict[str, Any]:
        self.calls.append(Call("json", prompt, schema, system, seed))
        if self.reply is None:
            raise LLMError(f"{self.model}: no scripted reply")
        return self.reply(prompt, schema)

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(Call("embed", "\n".join(texts)))
        if self.embed_one is None:
            raise LLMError(f"{self.model}: no scripted embedding")
        return [self.embed_one(t) for t in texts]


# --- Cache -----------------------------------------------------------------------------------------


@dataclass
class CachedClient:
    """Wraps a client; a request seen before (same model, prompt, system, schema, seed) is answered from disk."""

    inner: LLMClient
    root: Path
    hits: int = 0
    misses: int = 0

    @property
    def model(self) -> str:
        return self.inner.model

    def _path(self, request: dict[str, Any]) -> Path:
        key = hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
        safe_model = "".join(ch if ch.isalnum() or ch in "-._" else "_" for ch in self.model)
        return self.root / safe_model / key[:2] / f"{key}.json"

    def _cached(self, request: dict[str, Any], compute: Callable[[], Any]) -> Any:
        path = self._path(request)
        if path.is_file():
            self.hits += 1
            return json.loads(path.read_text(encoding="utf-8"))["response"]
        self.misses += 1
        response = compute()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"request": request, "response": response}, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        return response

    def ask_json(self, prompt: str, schema: dict[str, Any], *, system: str = "", seed: int = 0) -> dict[str, Any]:
        request = {"kind": "json", "model": self.model, "system": system, "prompt": prompt, "schema": schema, "seed": seed}
        return self._cached(request, lambda: self.inner.ask_json(prompt, schema, system=system, seed=seed))

    def embed(self, texts: list[str]) -> list[list[float]]:
        # One cache entry per text, so a changed candidate set re-embeds only the new questions.
        out: list[list[float]] = []
        for text in texts:
            request = {"kind": "embed", "model": self.model, "text": text}
            out.append(self._cached(request, lambda text=text: self.inner.embed([text])[0]))
        return out


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


# --- Real clients ----------------------------------------------------------------------------------


def _key(provider: str, env: Mapping[str, str]) -> str:
    name = ENV_KEYS[provider]
    value = env.get(name, "")
    if not value:
        raise LLMError(f"{name} is not set: export it in your shell (never put it in a file of the eval set)")
    return value


class ClaudeClient:
    """Messages API with structured output (`output_config.format` json_schema). Claude has no seed: it is only recorded."""

    def __init__(self, model: str, *, env: Mapping[str, str] | None = None, http_client: Any = None, max_tokens: int = 16000):
        import anthropic

        self.model = model
        self.max_tokens = max_tokens
        kwargs: dict[str, Any] = {"api_key": _key("claude", os.environ if env is None else env)}
        if http_client is not None:
            kwargs["http_client"] = http_client
        self._client = anthropic.Anthropic(**kwargs)

    def ask_json(self, prompt: str, schema: dict[str, Any], *, system: str = "", seed: int = 0) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "user", "content": prompt}],
            "output_config": {"format": {"type": "json_schema", "schema": schema}},
        }
        if system:
            kwargs["system"] = system
        response = self._client.messages.create(**kwargs)
        if response.stop_reason in ("refusal", "max_tokens"):
            raise LLMError(f"{self.model}: stopped with {response.stop_reason}")
        text = next((b.text for b in response.content if b.type == "text"), None)
        if text is None:
            raise LLMError(f"{self.model}: no text block in the reply")
        return json.loads(text)

    def embed(self, texts: list[str]) -> list[list[float]]:
        raise LLMError("Claude has no embedding endpoint: use a Gemini embedder in the config")


class GeminiClient:
    """generateContent with a JSON response schema; embedContent for vectors."""

    def __init__(self, model: str, *, env: Mapping[str, str] | None = None, http_client: Any = None):
        from google import genai
        from google.genai import types

        self.model = model
        self._types = types
        options = types.HttpOptions(httpx_client=http_client) if http_client is not None else None
        self._client = genai.Client(api_key=_key("gemini", os.environ if env is None else env), http_options=options)

    def ask_json(self, prompt: str, schema: dict[str, Any], *, system: str = "", seed: int = 0) -> dict[str, Any]:
        config = self._types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=schema,
            system_instruction=system or None,
            seed=seed,
            temperature=0,
        )
        response = self._client.models.generate_content(model=self.model, contents=prompt, config=config)
        if not response.text:
            raise LLMError(f"{self.model}: empty reply")
        return json.loads(response.text)

    #: Texts per embedContent request (the API caps a batch at 100).
    EMBED_BATCH = 100

    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for at in range(0, len(texts), self.EMBED_BATCH):
            batch = texts[at : at + self.EMBED_BATCH]
            response = self._client.models.embed_content(model=self.model, contents=batch)
            vectors = [list(e.values or []) for e in response.embeddings or []]
            if len(vectors) != len(batch):
                raise LLMError(f"{self.model}: {len(vectors)} embeddings for {len(batch)} texts")
            out += vectors
        return out


def make_client(ref: ModelRef, cache_dir: Path | None, *, env: Mapping[str, str] | None = None, http_client: Any = None) -> LLMClient:
    """`http_client` replaces the SDK's own (tests: a mock transport). The Claude SDK takes an `httpx2.Client`, Gemini an `httpx.Client`."""
    inner: LLMClient
    if ref.provider == "claude":
        inner = ClaudeClient(ref.model, env=env, http_client=http_client)
    else:
        inner = GeminiClient(ref.model, env=env, http_client=http_client)
    return CachedClient(inner, cache_dir) if cache_dir is not None else inner


def make_clients(
    config: LLMConfig,
    cache_dir: Path | None,
    *,
    env: Mapping[str, str] | None = None,
    http_clients: Mapping[str, Any] | None = None,
) -> dict[str, LLMClient]:
    """`generator`, `judge` and `embedder` clients from the pinned config; `http_clients` is by provider."""
    out: dict[str, LLMClient] = {}
    for role in ("generator", "judge", "embedder"):
        ref: ModelRef = getattr(config, role)
        out[role] = make_client(ref, cache_dir, env=env, http_client=(http_clients or {}).get(ref.provider))
    return out
