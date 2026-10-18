"""Loading a corpus snapshot and checking it against its own manifest."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

from .io import read_json, read_jsonl
from .schema import Chunk, Manifest, ManifestDocument


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass
class Snapshot:
    root: Path
    manifest: Manifest
    #: doc_key → markdown, exactly as the app stored it.
    markdown: dict[str, str]
    chunks: list[Chunk]
    #: Problems found while loading (missing markdown files); `verify` adds the rest.
    load_problems: list[str] = field(default_factory=list)

    @property
    def snapshot_id(self) -> str:
        return self.manifest.snapshot_id

    @property
    def chunker_version(self) -> str:
        return self.manifest.chunker.version

    def document(self, doc_key: str) -> ManifestDocument | None:
        return next((d for d in self.manifest.documents if d.doc_key == doc_key), None)

    def chunks_of(self, doc_key: str) -> list[Chunk]:
        return [c for c in self.chunks if c.doc_key == doc_key]


def load_snapshot(root: Path) -> Snapshot:
    manifest = read_json(root / "manifest.json", Manifest)
    markdown: dict[str, str] = {}
    problems: list[str] = []
    for doc in manifest.documents:
        path = root / doc.md_path
        if not path.is_file():
            problems.append(f"{doc.doc_key}: markdown file {doc.md_path} missing")
            continue
        # Bytes, not text mode: newline translation would change the hash and every offset.
        markdown[doc.doc_key] = path.read_bytes().decode("utf-8")
    chunks = read_jsonl(root / manifest.chunks_path, Chunk)
    return Snapshot(root=root, manifest=manifest, markdown=markdown, chunks=chunks, load_problems=problems)


def verify_snapshot(snap: Snapshot) -> list[str]:
    """Markdown hashes and lengths, chunk counts, chunk keys and offsets, all against the manifest."""
    problems = list(snap.load_problems)
    keys = [d.doc_key for d in snap.manifest.documents]
    for dup in sorted({k for k in keys if keys.count(k) > 1}):
        problems.append(f"{dup}: document listed twice in the manifest")
    for doc in snap.manifest.documents:
        md = snap.markdown.get(doc.doc_key)
        if md is None:
            continue
        if sha256_text(md) != doc.md_sha256:
            problems.append(f"{doc.doc_key}: markdown sha256 differs from the manifest (file changed after export?)")
        if len(md) != doc.chars:
            problems.append(f"{doc.doc_key}: {len(md)} characters, manifest says {doc.chars}")
        n = len(snap.chunks_of(doc.doc_key))
        if n != doc.chunks:
            problems.append(f"{doc.doc_key}: {n} chunks, manifest says {doc.chunks}")

    seen: set[str] = set()
    for c in snap.chunks:
        if c.chunk_key in seen:
            problems.append(f"{c.chunk_key}: duplicate chunk key")
        seen.add(c.chunk_key)
        if c.chunk_key != f"{c.doc_key}#{c.chunk_index}":
            problems.append(f"{c.chunk_key}: key does not match {c.doc_key}#{c.chunk_index}")
        md = snap.markdown.get(c.doc_key)
        if md is None:
            if c.doc_key not in keys:
                problems.append(f"{c.chunk_key}: document {c.doc_key} not in the manifest")
            continue
        if c.char_end > len(md):
            problems.append(f"{c.chunk_key}: offsets {c.char_start}-{c.char_end} past the end of the markdown ({len(md)})")
    return problems
