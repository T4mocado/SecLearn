import { createHash } from "crypto";
import path from "path";
import OpenAI from "openai";
import { getEnv, resolveEmbedModel } from "@/lib/env";
import {
  embedApiError,
  isAppError,
  missingEmbedKeyError,
} from "@/lib/errors";

type FeatureExtractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let localExtractor: FeatureExtractor | null = null;
let localModelId: string | null = null;

function mockEmbed(text: string, dim: number): number[] {
  const hash = createHash("sha256").update(text).digest();
  const vec = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const b = hash[i % hash.length]!;
    const b2 = hash[(i + 7) % hash.length]!;
    vec[i] = ((b / 255) * 2 - 1) * 0.5 + ((b2 / 255) * 2 - 1) * 0.1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function assertEmbedConfigured(): void {
  const env = getEnv();
  if (env.EMBED_PROVIDER === "mock") return;
  if (env.EMBED_PROVIDER === "openai" && !env.OPENAI_API_KEY.trim()) {
    throw missingEmbedKeyError();
  }
  if (
    env.EMBED_PROVIDER === "huggingface" &&
    !env.HF_EMBED_URL.trim() &&
    !env.HF_TOKEN.trim()
  ) {
    throw embedApiError("HF_TOKEN is empty (EMBED_PROVIDER=huggingface, no HF_EMBED_URL)");
  }
  // local: no API key; first call may download weights
}

function normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/** Mean-pools token vectors when the endpoint returns token-level output instead of a sentence vector. */
function toSentenceVector(item: number[] | number[][]): number[] {
  if (!Array.isArray(item[0])) return item as number[];
  const tokens = item as number[][];
  const vec = new Array<number>(tokens[0]!.length).fill(0);
  for (const t of tokens) for (let i = 0; i < vec.length; i++) vec[i]! += t[i]!;
  return vec.map((v) => v / tokens.length);
}

async function embedHuggingFace(texts: string[]): Promise<number[][]> {
  const env = getEnv();
  const model = resolveEmbedModel(env);
  const localUrl = env.HF_EMBED_URL.trim();
  const url =
    localUrl ||
    `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Only send the token to HuggingFace itself, never to a custom endpoint.
  if (!localUrl && env.HF_TOKEN.trim()) headers.Authorization = `Bearer ${env.HF_TOKEN}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
      // Scales with batch size: a CPU-only embed server needs ~1–2s per chunk under load.
      signal: AbortSignal.timeout(30_000 + texts.length * 5_000),
    });
    if (!res.ok) {
      throw embedApiError(`HuggingFace ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as Array<number[] | number[][]>;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw embedApiError(
        `HuggingFace returned ${Array.isArray(data) ? data.length : 0} vectors for ${texts.length} inputs`,
      );
    }
    return data.map((item) => {
      const vec = normalize(toSentenceVector(item));
      if (vec.length !== env.EMBED_DIM) {
        throw embedApiError(`HuggingFace returned dim ${vec.length}, expected EMBED_DIM=${env.EMBED_DIM}`);
      }
      return vec;
    });
  } catch (err) {
    if (isAppError(err)) throw err;
    throw embedApiError(err instanceof Error ? err.message : "huggingface embed failed");
  }
}

async function getLocalExtractor(model: string): Promise<FeatureExtractor> {
  if (localExtractor && localModelId === model) return localExtractor;

  const env = getEnv();
  const cacheDir =
    env.TRANSFORMERS_CACHE.trim() ||
    path.join(process.cwd(), ".cache", "transformers");

  // Dynamic import keeps Next/webpack from bundling onnxruntime into the client.
  const { pipeline, env: xenovaEnv } = await import("@xenova/transformers");
  xenovaEnv.allowLocalModels = false;
  xenovaEnv.cacheDir = cacheDir;

  try {
    const extractor = (await pipeline("feature-extraction", model, {
      quantized: true,
    })) as unknown as FeatureExtractor;
    localExtractor = extractor;
    localModelId = model;
    return extractor;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "model load failed";
    throw embedApiError(detail);
  }
}

async function embedLocal(text: string): Promise<number[]> {
  const env = getEnv();
  const model = resolveEmbedModel(env);
  const extractor = await getLocalExtractor(model);
  try {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const data = Array.from(output.data);
    if (data.length !== env.EMBED_DIM) {
      throw embedApiError(
        `model produced dim ${data.length}, expected EMBED_DIM=${env.EMBED_DIM}`,
      );
    }
    return data;
  } catch (err) {
    if (isAppError(err)) throw err;
    const detail = err instanceof Error ? err.message : "local embed failed";
    throw embedApiError(detail);
  }
}

async function embedOpenAi(texts: string[]): Promise<number[][]> {
  const env = getEnv();
  assertEmbedConfigured();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = resolveEmbedModel(env);
  try {
    const res = await client.embeddings.create({
      model,
      input: texts,
      // text-embedding-3-* supports custom dimensions; keep aligned with Prisma vector(N) / EMBED_DIM.
      ...(model.startsWith("text-embedding-3") ? { dimensions: env.EMBED_DIM } : {}),
    });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    if (sorted.length !== texts.length) {
      throw embedApiError(`OpenAI returned ${sorted.length} vectors for ${texts.length} inputs`);
    }
    return sorted.map(({ embedding }) => {
      if (embedding.length !== env.EMBED_DIM) {
        throw embedApiError(
          `OpenAI returned dim ${embedding.length}, expected EMBED_DIM=${env.EMBED_DIM}`,
        );
      }
      return embedding;
    });
  } catch (err) {
    if (isAppError(err)) throw err;
    const detail = err instanceof Error ? err.message : "openai embed failed";
    throw embedApiError(detail);
  }
}

/** Embeds many texts in one provider call; output order matches input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const env = getEnv();
  const inputs = texts.map((t) => t.slice(0, 8000).trim() || " ");

  if (env.EMBED_PROVIDER === "mock") {
    return inputs.map((t) => mockEmbed(t, env.EMBED_DIM));
  }

  assertEmbedConfigured();

  if (env.EMBED_PROVIDER === "local") {
    const out: number[][] = [];
    for (const t of inputs) out.push(await embedLocal(t));
    return out;
  }
  if (env.EMBED_PROVIDER === "huggingface") {
    return embedHuggingFace(inputs);
  }

  // openai — never silent mock fallback
  return embedOpenAi(inputs);
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec!;
}

export function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
