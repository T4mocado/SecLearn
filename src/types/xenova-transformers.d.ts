declare module "@xenova/transformers" {
  export const env: {
    allowLocalModels: boolean;
    cacheDir: string;
    backends?: unknown;
  };

  export function pipeline(
    task: string,
    model: string,
    options?: { quantized?: boolean },
  ): Promise<
    (
      text: string,
      opts?: { pooling?: "mean" | "none" | "cls"; normalize?: boolean },
    ) => Promise<{ data: Float32Array | number[] }>
  >;
}
