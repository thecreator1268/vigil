# syntax=docker/dockerfile:1.7
# Build context: repository root (the service depends on workspace packages).
#   docker build -f services/checkin-service/Dockerfile .
ARG PKG=@vigil/dev-idp

# ---- deps ----
# Depends ONLY on the lockfile + workspace manifest, so this (slow, network)
# layer is reused until dependencies actually change. The pnpm store is part of
# the layer itself (not a BuildKit cache mount): CI's layer cache (type=gha)
# does not persist cache-mount contents, so a restored layer would otherwise
# arrive with an empty store and break the --offline install.
# Pinned by digest (Dependabot keeps this current — see .github/dependabot.yml).
FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS deps
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
# Pinned by digest (Dependabot keeps this current — see .github/dependabot.yml).
FROM gcr.io/distroless/nodejs22-debian13@sha256:f643bc05bdcf5a8d98442e8a2a5c7a3a4c3a0e3bc4cdc5f10557d47f1ddd5812 AS runtime
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
