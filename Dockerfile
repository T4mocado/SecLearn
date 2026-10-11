FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/data/uploads /app/.cache/transformers
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
# Local embeddings (@xenova/transformers + onnxruntime-node) — keep beside standalone server
COPY --from=builder /app/node_modules/@xenova ./node_modules/@xenova
COPY --from=builder /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=builder /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=builder /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder /app/node_modules/semver ./node_modules/semver
COPY --from=builder /app/node_modules/node-addon-api ./node_modules/node-addon-api
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3847
ENV PORT=3847
ENV HOSTNAME=0.0.0.0
ENV TRANSFORMERS_CACHE=/app/.cache/transformers
ENTRYPOINT ["/entrypoint.sh"]
