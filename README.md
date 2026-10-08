# SecLearn

Beginner cybersecurity learning app: AI chat (guest + authenticated), bilingual lessons, **Ôn tập** review quizzes, and admin PDF → vector RAG.

Monolith: **Next.js (App Router) + TypeScript + Tailwind + shadcn-style UI + next-intl (VI/EN) + Auth.js + Prisma + Postgres/pgvector**.

## Quick start (local)

### 1. Prerequisites

- Node.js 22+
- PostgreSQL 16 with **pgvector** (or Docker Compose below)

### 2. Environment

```bash
cp .env.example .env
# edit secrets / keys as needed
```

Defaults use `LLM_PROVIDER=mock` and `EMBED_PROVIDER=mock` so the UI runs without API keys.

### 3. Database

```bash
npx prisma db push
npx tsx prisma/seed.ts
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
docker compose up --build
```

- App: `http://localhost:3847`
- Postgres (pgvector): port `5432`
- PDF uploads volume: `uploads`

## Main flows

| Actor | Capabilities |
|-------|----------------|
| Guest | Public RAG chat, 10-question limit, client draft, locale default `vi` |
| Learner | Unlimited chat + persist, full-draft migrate, lessons, **Ôn tập** generate+save |
| Admin (`User.role=admin`) | Users, PDF ingest/reindex, lessons VI+EN |

## Useful scripts

```bash
npm run dev          # next dev on 3847
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run db:push      # prisma db push
npm run db:seed      # seed admin + lessons
npm run smoke        # API smoke checks (mock mode)
```

## Secrets

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Postgres connection |
| `AUTH_SECRET` | Auth.js secret |
| `LLM_PROVIDER` | `mock` \| `openai` \| `deepseek` |
| `EMBED_PROVIDER` | `mock` \| `openai` |
| `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` | Provider keys |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap admin |

Never commit real `.env` values.
