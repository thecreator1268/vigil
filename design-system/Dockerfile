# syntax=docker/dockerfile:1.7
# Build context: repository root.   docker build -f design-system/Dockerfile .
#
# No build step: the design system is hand-authored static HTML/CSS/JS (no
# bundler, no node_modules). Same distroless, non-root runtime as every other
# VIGIL image, for consistency — just without the deps/build stages, since
# there's nothing to compile.
# Pinned by digest (Dependabot keeps this current — see .github/dependabot.yml).
FROM gcr.io/distroless/nodejs22-debian13@sha256:f643bc05bdcf5a8d98442e8a2a5c7a3a4c3a0e3bc4cdc5f10557d47f1ddd5812 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=4600
COPY design-system/project ./project
COPY design-system/server ./server
COPY infra/docker/healthcheck.js ./healthcheck.cjs
USER nonroot
EXPOSE 4600
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/nodejs/bin/node", "healthcheck.cjs"]
CMD ["server/main.js"]
