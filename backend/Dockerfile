# Multi-stage single-container image: Loco API + built Vite PWA.
# Build the frontend on the host first (`npm run build` in frontend/),
# then build with the REPO ROOT as context so `frontend/dist` is visible:
#   docker build -f backend/Dockerfile -t tshirt-studio .
# Runtime honors the `PORT` env var via
# `config/production.yaml` (`get_env(name="PORT", default="5150")`) and binds
# 0.0.0.0. Required env at run time (no secrets baked in here):
#   HOST, JWT_SECRET, DATABASE_URL (throwaway local sqlite file used only for
#   the pre-swap boot connect; runtime data lives in TURSO_FILE),
#   MAILER_HOST/MAILER_PORT/MAILER_USER/MAILER_PASSWORD,
#   optional TURSO_FILE (default data/app.db), STORAGE_PATH (default
#   data/uploads), TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (cloud sync),
#   optional FRONTEND_DIST (default frontend/dist, i.e. /app/frontend/dist here).
FROM rust:1.99-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock ./
COPY patches ./patches
COPY migration ./migration
COPY src ./src
COPY config ./config
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/target/release/tshirt_backend-cli /app/server
COPY --from=builder /app/config /app/config
# PWA built on host — do NOT build node inside this image.
COPY frontend/dist ./frontend/dist
RUN mkdir -p /app/data
ENV PORT=5150 FRONTEND_DIST=frontend/dist
# NOTE: Temps injects PORT=<project port> (3000) at runtime and maps the
# published host port to the EXPOSEd container port, so EXPOSE must equal the
# injected PORT, not the local default. Keep both at 3000 for Temps.
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://127.0.0.1:${PORT:-5150}/healthz || exit 1
CMD ["./server", "start", "--environment", "production"]
