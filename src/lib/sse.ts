export function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createSseResponse(
  stream: ReadableStream<Uint8Array>,
): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function streamLlmToSse(opts: {
  tokens: AsyncGenerator<string, void, unknown>;
  /** Sent as a `sources` event before the first token. */
  sources?: unknown;
  /** Runs after the last token; a returned event (e.g. citation checks) is sent before `done`. */
  finalize?: (full: string) => Promise<{ event: string; data: unknown } | null>;
  onDone?: (full: string) => Promise<void> | void;
  onError?: (message: string) => Promise<void> | void;
}): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  let full = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (opts.sources !== undefined) {
          controller.enqueue(encoder.encode(sseEncode("sources", { sources: opts.sources })));
        }
        for await (const token of opts.tokens) {
          full += token;
          controller.enqueue(encoder.encode(sseEncode("token", { token })));
        }
        const extra = await opts.finalize?.(full);
        if (extra) controller.enqueue(encoder.encode(sseEncode(extra.event, extra.data)));
        await opts.onDone?.(full);
        controller.enqueue(encoder.encode(sseEncode("done", { ok: true })));
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Streaming failed. Please try again.";
        await opts.onError?.(message);
        controller.enqueue(encoder.encode(sseEncode("error", { message })));
        controller.close();
      }
    },
    cancel() {
      // client abort — persistence handled by caller via onDone when possible
    },
  });
}
