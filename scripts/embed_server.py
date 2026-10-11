"""Local embedding server for BKAI vietnamese-bi-encoder (768-d).

Setup:  pip install sentence-transformers pyvi
Run:    python scripts/embed_server.py
Then set in .env:  HF_EMBED_URL="http://127.0.0.1:8008"
Request:  POST {"inputs": "text"}         ->  [768 floats]
          POST {"inputs": ["a", "b", ...]} ->  [[768 floats], [768 floats], ...]

Reranker (cross-encoder, same process; set RERANK_MODEL="" to skip loading it):
Request:  POST /rerank {"query": "q", "documents": ["a", "b", ...]} -> [0..1 relevance per document]
          POST /rerank {"pairs": [["q1", "a"], ["q2", "b"], ...]}  -> [0..1 per pair]
Then set in .env:  RERANK_URL="http://127.0.0.1:8008/rerank"
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from sentence_transformers import CrossEncoder, SentenceTransformer

MODEL = os.environ.get("EMBED_MODEL", "bkai-foundation-models/vietnamese-bi-encoder")
PORT = int(os.environ.get("EMBED_PORT", "8008"))
BATCH_SIZE = int(os.environ.get("EMBED_BATCH_SIZE", "32"))
RERANK_MODEL = os.environ.get("RERANK_MODEL", "BAAI/bge-reranker-v2-m3")

try:
    from pyvi.ViTokenizer import tokenize as segment
except Exception:  # pyvi optional
    segment = lambda t: t

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading {MODEL} on {DEVICE} ...", flush=True)
model = SentenceTransformer(MODEL, device=DEVICE)
model.max_seq_length = 256

reranker = None
if RERANK_MODEL:
    print(f"Loading reranker {RERANK_MODEL} on {DEVICE} ...", flush=True)
    # Sigmoid maps the single logit to a 0..1 relevance score the app thresholds on.
    reranker = CrossEncoder(
        RERANK_MODEL, device=DEVICE, max_length=512, activation_fn=torch.nn.Sigmoid()
    )
    if DEVICE == "cuda":
        reranker.model.half()
print("Ready on port", PORT, flush=True)


def rerank(body):
    if reranker is None:
        raise RuntimeError("reranker disabled (RERANK_MODEL is empty)")
    # Raw text on purpose: the cross-encoder has its own tokenizer, pyvi segmentation is for BKAI only.
    if "pairs" in body:
        pairs = [(q, d) for q, d in body["pairs"]]
    else:
        pairs = [(body["query"], d) for d in body["documents"]]
    if not pairs:
        return []
    return [float(s) for s in reranker.predict(pairs, batch_size=BATCH_SIZE)]


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if self.path.rstrip("/") == "/rerank":
                out, code = json.dumps(rerank(body)).encode(), 200
            else:
                inputs = body["inputs"]
                single = isinstance(inputs, str)
                texts = [segment(t) for t in ([inputs] if single else inputs)]
                vecs = model.encode(
                    texts, batch_size=BATCH_SIZE, normalize_embeddings=True
                ).tolist()
                out, code = json.dumps(vecs[0] if single else vecs).encode(), 200
        except Exception as e:  # noqa: BLE001
            out, code = json.dumps({"error": str(e)}).encode(), 500
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(out)
        except ConnectionError:
            pass  # client gave up (timeout) — nothing to send back

    def log_message(self, *args):  # silence per-request access log
        pass


# Threaded so several documents (INGEST_CONCURRENCY) can embed at the same time.
ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
