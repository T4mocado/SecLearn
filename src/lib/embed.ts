import { createHash } from "crypto";
import OpenAI from "openai";
import { EMBED_DIM, getEnv } from "@/lib/env";

function mockEmbed(text: string): number[] {
  const hash = createHash("sha256").update(text).digest();
  const vec = new Array<number>(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) {
    const b = hash[i % hash.length]!;
    const b2 = hash[(i + 7) % hash.length]!;
    vec[i] = ((b / 255) * 2 - 1) * 0.5 + ((b2 / 255) * 2 - 1) * 0.1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export async function embedText(text: string): Promise<number[]> {
  const env = getEnv();
  const input = text.slice(0, 8000).trim() || " ";

  if (env.EMBED_PROVIDER === "mock" || !env.OPENAI_API_KEY) {
    return mockEmbed(input);
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input,
    });
    const embedding = res.data[0]?.embedding;
    if (!embedding || embedding.length !== EMBED_DIM) {
      return mockEmbed(input);
    }
    return embedding;
  } catch {
    return mockEmbed(input);
  }
}

export function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
