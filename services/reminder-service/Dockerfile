# syntax=docker/dockerfile:1.7
# Build context: repository root (the service depends on workspace packages).
#   docker build -f services/checkin-service/Dockerfile .
ARG PKG=@vigil/reminder-service

# ---- deps ----
# Depends ONLY on the lockfile + workspace manifest, so this (slow, network)
# layer is reused until dependencies actually change. The pnpm store is part of
# the layer itself (not a BuildKit cache mount): CI's layer cache (type=gha)
# does not persist cache-mount contents, so a restored layer would otherwise
# arrive with an empty store and break the --offline install.
FROM node:22-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && pnpm fetch --frozen-lockfile --store-dir /pnpm/store

# ---- build ----
FROM deps AS build
ARG PKG
COPY . .
RUN pnpm install --offline --frozen-lockfile --store-dir /pnpm/store --filter "${PKG}..." \
 && pnpm --filter "${PKG}..." build \
 && pnpm --filter "${PKG}" deploy --prod --offline --store-dir /pnpm/store /out

# ---- runtime (distroless, non-root) ----
# No shell, no package manager: nothing for an attacker to spawn or install.
# Dependencies are pure JS, so the musl→glibc hop from alpine is safe.
FROM gcr.io/distroless/nodejs22-debian13 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/dist ./dist
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /app/infra/docker/healthcheck.js ./healthcheck.js
USER nonroot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 CMD ["/nodejs/bin/node", "healthcheck.js"]
CMD ["dist/main.js"]
