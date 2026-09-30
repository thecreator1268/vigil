# syntax=docker/dockerfile:1.7
# Build context: repository root.   docker build -f apps/pwa/Dockerfile .
# Same deps → build → distroless pattern as every service.

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack enable && pnpm fetch --frozen-lockfile --store-dir /pnpm/store

# ---- build ----
FROM deps AS build
ARG VITE_DEMO_VICTIM_ID=v_demo_0001
ARG VITE_DEFAULT_REGION=pune
ENV VITE_DEMO_VICTIM_ID=${VITE_DEMO_VICTIM_ID} VITE_DEFAULT_REGION=${VITE_DEFAULT_REGION}
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store --filter "@vigil/pwa..." \
 && pnpm --filter "@vigil/pwa^..." build \
 && pnpm --filter @vigil/pwa build

# ---- runtime (distroless, non-root) ----
# The static server has zero npm dependencies: only dist/ and server/ ship.
FROM gcr.io/distroless/nodejs22-debian13 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=5173
COPY --from=build /app/apps/pwa/package.json ./package.json
COPY --from=build /app/apps/pwa/dist ./dist
COPY --from=build /app/apps/pwa/server ./server
COPY --from=build /app/infra/docker/healthcheck.js ./healthcheck.cjs
USER nonroot
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["/nodejs/bin/node", "healthcheck.cjs"]
CMD ["server/main.js"]
