#!/bin/sh
# UAT container entrypoint: apply pending Prisma migrations, optionally seed,
# then hand off to the server (CMD). `set -e` means a failed migration stops
# the container instead of starting the app against a half-migrated schema.
set -e

cd /app/backend

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
# migrate deploy only ever applies already-committed migration folders, in
# order — it never generates new ones, never resets, and never prompts.
npx prisma migrate deploy

# Seeding is opt-in: it upserts the permission catalog and the super admin
# (credentials from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), plus the demo
# product catalog. Turn it on for the very first boot of a fresh database,
# then set RUN_SEED back to false.
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] RUN_SEED=true — running prisma db seed..."
  npx prisma db seed
fi

echo "[entrypoint] Starting server..."
exec "$@"
