#!/bin/bash
# ============================================
# Nigar AI — Production Deploy Script
# ============================================
# Runs on the VPS. Called by GitHub Actions or manually.
# Assumes the repo is cloned at ~/aipsychologist and .env exists.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/aipsychologist}"
COMPOSE_FILE="docker-compose.prod.yml"
HEALTH_URL="http://localhost:3000/api/v1/health"
HEALTH_RETRIES=30
HEALTH_INTERVAL=2

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

err() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

cd "$REPO_DIR"

log "📥 Pulling latest code..."
git fetch origin main
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/main)

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  log "✅ Already up to date ($LOCAL_SHA). Skipping deploy."
  exit 0
fi

git reset --hard origin/main
log "✅ Code updated to $(git rev-parse --short HEAD)"

# Run DB schema sync (idempotent — safe to rerun)
log "🗄️ Syncing database schema..."
docker run --rm \
  -v "$REPO_DIR:/app" \
  -w /app \
  --env-file .env \
  --network host \
  node:20-slim \
  sh -c "corepack enable && pnpm install --frozen-lockfile --silent && cd packages/prisma-client && npx prisma generate && npx prisma db push" \
  || {
    err "Database schema sync failed"
    exit 1
  }
log "✅ DB schema synced"

# Rebuild only changed services
log "🔨 Building Docker images..."
docker compose -f "$COMPOSE_FILE" build api bot

# Restart with new images (Caddy + Redis untouched)
log "🚀 Restarting services..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps api bot

# Health check
log "🩺 Waiting for API health..."
for i in $(seq 1 $HEALTH_RETRIES); do
  if curl -fsS "$HEALTH_URL" > /dev/null 2>&1; then
    log "✅ API healthy after ${i} attempts"
    break
  fi
  if [ "$i" -eq "$HEALTH_RETRIES" ]; then
    err "API health check failed after $HEALTH_RETRIES attempts"
    docker compose -f "$COMPOSE_FILE" logs --tail=50 api
    exit 1
  fi
  sleep $HEALTH_INTERVAL
done

# Prune dangling images (free disk space)
log "🧹 Pruning dangling images..."
docker image prune -f > /dev/null

log "✅ Deploy complete. Current version: $(git rev-parse --short HEAD)"
