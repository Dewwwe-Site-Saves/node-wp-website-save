#!/bin/sh
# Container start: map the runtime user to PUID/PGID, make the data directory theirs, apply the migrations, start the server.
set -eu

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
PUID=${PUID:-1000}
PGID=${PGID:-1000}
DATA_DIR=${DATA_DIR:-/data}

echo "Reposite v${VERSION}"
echo "Running as UID ${PUID} GID ${PGID}, data in ${DATA_DIR}"

# Reuse the group and user that already carry these ids, create them otherwise.
APP_GROUP=$(getent group "$PGID" | cut -d: -f1 || true)
if [ -z "$APP_GROUP" ]; then
    addgroup -g "$PGID" reposite
    APP_GROUP=reposite
fi
APP_USER=$(getent passwd "$PUID" | cut -d: -f1 || true)
if [ -z "$APP_USER" ]; then
    adduser -D -H -h /app -u "$PUID" -G "$APP_GROUP" reposite
    APP_USER=reposite
else
    addgroup "$APP_USER" "$APP_GROUP" 2>/dev/null || true
fi

# Ownership of the data directory. Top-level entries only: the clones under files/ hold hundreds of thousands of files, so a clone gets a recursive pass only when its own owner is wrong (clones copied by hand before a boot).
mkdir -p "$DATA_DIR/files" "$DATA_DIR/sp-certificates" /app/.next/cache
chown "$PUID:$PGID" "$DATA_DIR" "$DATA_DIR/files" /app/.next/cache
chown -R "$PUID:$PGID" "$DATA_DIR/sp-certificates"
find "$DATA_DIR" -maxdepth 1 -name 'backup.db*' -exec chown "$PUID:$PGID" {} +
find "$DATA_DIR/files" -mindepth 1 -maxdepth 1 ! -user "$PUID" -exec sh -c 'echo "Fixing ownership of $1 (one-time)"; chown -R "$2" "$1"' _ {} "$PUID:$PGID" \;

if ! su-exec "$APP_USER" sh -c "touch '$DATA_DIR/.write-test' && rm -f '$DATA_DIR/.write-test'"; then
    echo "ERROR: $DATA_DIR is not writable by UID $PUID. On the host: chown -R $PUID:$PGID <mounted data directory>" >&2
    exit 1
fi

echo "Applying database migrations..."
su-exec "$APP_USER" node_modules/.bin/prisma migrate deploy

echo "Starting server on port ${PORT:-3000}..."
exec su-exec "$APP_USER" node server.js
