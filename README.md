# SecLearn

Beginner cybersecurity learning app: AI chat (guest + authenticated), bilingual lessons, **Ôn tập** review quizzes, and admin PDF → vector RAG.

Monolith: **Next.js (App Router) + TypeScript + Tailwind + shadcn-style UI + next-intl (VI/EN) + Auth.js + Prisma + Postgres/pgvector**.

## Locked LLM / embed defaults (option A)

| Concern | Default | Notes |
|--------|---------|--------|
| Chat | `LLM_PROVIDER=deepseek` | Model `LLM_MODEL=deepseek-flash` (override via env) |
| Embeddings | `EMBED_PROVIDER=openai` | `text-embedding-3-small`, **dim 1536** (Prisma `vector(1536)`) |
| Optional embed | `EMBED_PROVIDER=local` | `@xenova/transformers` + MiniLM (**dim 384** — requires schema/migrate + reindex) |
| Demos | `*_PROVIDER=mock` | Hash vectors / canned chat; **no** silent mock when provider ≠ `mock` |
| Keys | `.env` only | Never commit secrets; `.env.example` has placeholders |

## Quick start (local)

### 1. Prerequisites

- Node.js 22+
- PostgreSQL 16 with **pgvector** (or Docker Compose below)

### 2. Environment

```bash
cp .env.example .env
# set DEEPSEEK_API_KEY for chat (required when LLM_PROVIDER=deepseek)
# set OPENAI_API_KEY for embeddings (required when EMBED_PROVIDER=openai)
```

For UI smoke **without** API keys:

```env
LLM_PROVIDER=mock
EMBED_PROVIDER=mock
```

### 3. Database

```bash
npx prisma db push
# or, if you use migrations: npx prisma migrate deploy
npx tsx prisma/seed.ts
```

**After changing `EMBED_DIM` / vector size** (e.g. 384 local → **1536** OpenAI, or the reverse):

```bash
npx prisma migrate deploy
# or: npx prisma db push
# then Admin → Reindex every PDF (old vectors are incompatible)
```

Seed creates admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` and sample bilingual lessons.

### 4. Dev server

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847) (guest default locale `vi`).

## Docker Compose

```bash
cp .env.example .env
# set DEEPSEEK_API_KEY and OPENAI_API_KEY in .env
docker compose up --build
```

- App: `http://localhost:3847`
- Postgres (pgvector): port `5432`
- PDF uploads volume: `uploads`
- `transformers_cache` volume only matters if you switch to `EMBED_PROVIDER=local`

## How to test chat + ingest

1. **Chat (DeepSeek):** set `LLM_PROVIDER=deepseek`, `DEEPSEEK_API_KEY=…`, restart. Ask a guest question on `/vi` or `/en`. Missing key → red error (VI/EN), not a fake answer.
2. **RAG retrieve:** with `EMBED_PROVIDER=openai` + `OPENAI_API_KEY`, query embed uses the same model as ingest.
3. **Admin ingest:** log in as admin → Documents → upload a PDF. Status becomes `ready` or `failed` with a bilingual error. Fix config → **Reindex**.
4. **Smoke (mock):** `LLM_PROVIDER=mock` + `EMBED_PROVIDER=mock`, then `npm run smoke`.

## Embedding server 
python scripts/embed_server.py

## Useful scripts

```bash
npm run dev          # next dev on 3847
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run db:push      # prisma db push
npm run db:seed      # seed admin + lessons
npm run smoke        # API smoke checks (expects mock providers)
```

## Environment reference

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection |
| `AUTH_SECRET` | Auth.js secret |
| `LLM_PROVIDER` | `deepseek` \| `openai` \| `mock` (default **deepseek**) |
| `LLM_MODEL` | Chat model id (default `deepseek-flash` / `gpt-4o-mini`) |
| `EMBED_PROVIDER` | `openai` \| `mock` \| `local` (default **openai**) |
| `EMBED_MODEL` | Embed model id (default `text-embedding-3-small`) |
| `EMBED_DIM` | Vector size — must match Prisma `vector(N)` (default **1536**) |
| `TRANSFORMERS_CACHE` | ONNX weight cache (only for `EMBED_PROVIDER=local`) |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | Provider keys (`.env` only) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap admin |

Never commit real `.env` values.
