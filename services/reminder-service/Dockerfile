# syntax=docker/dockerfile:1.7
# Build context: repository root (the service depends on workspace packages).
#   docker build -f services/checkin-service/Dockerfile .
ARG PKG=@vigil/reminder-service

# ---- deps ----
# Depends ONLY on the lockfile + workspace manifest, so this (slow, network)
# layer is reused until dependencies actually change. pnpm's content store
# lives in a BuildKit cache mount shared by every service image.
FROM node:22-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    corepack enable && pnpm fetch --frozen-lockfile --store-dir /pnpm/store

# ---- build ----
FROM deps AS build
ARG PKG
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store --filter "${PKG}..." \
 && pnpm --filter "${PKG}..." build \
 && pnpm --filter "${PKG}" deploy --prod --offline --store-dir /pnpm/store /out

# ---- runtime (distroless, non-root) ----
# No shell, no package manager: nothing for an attacker to spawn or install.
# Dependencies are pure JS, so the musl→glibc hop from alpine is safe.
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
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
