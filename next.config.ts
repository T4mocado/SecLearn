import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  // Keep onnxruntime / transformers out of the webpack bundle (Node native + large weights).
  // pdf-parse (pdfjs) loads its worker from node_modules at runtime and breaks when bundled.
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "pdf-parse", "pdfjs-dist"],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@xenova/transformers/**/*",
      "./node_modules/onnxruntime-node/**/*",
      "./node_modules/sharp/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
