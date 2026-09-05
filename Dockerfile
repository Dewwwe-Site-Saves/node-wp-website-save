# Pinned on purpose: a moving tag such as node:24-alpine swaps the Alpine release underneath and breaks native modules. Bump it explicitly.
ARG NODE_IMAGE=node:24.13.1-alpine3.23

# ---- builder: full install, Prisma client, Next.js standalone build ----
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
# Only used when no better-sqlite3 prebuild matches the platform.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
# The postinstall hook runs `prisma generate`, which loads prisma.config.ts and lib/paths.ts.
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY lib/paths.ts ./lib/paths.ts
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- prod-deps: runtime node_modules, Prisma CLI and tsx included (see package.json) ----
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY lib/paths.ts ./lib/paths.ts
RUN npm ci --omit=dev && npm cache clean --force

# ---- runner ----
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
# git: the engine. openssl: Prisma on Alpine. dumb-init, su-exec, shadow: signal handling and PUID/PGID in the entrypoint.
RUN apk add --no-cache git openssl ca-certificates dumb-init su-exec shadow
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/data \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PUID=1000 \
    PGID=1000
# Standalone server with its traced node_modules, then the full runtime node_modules on top (a superset: Prisma CLI, tsx, generated client).
COPY --from=builder /app/.next/standalone ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/static ./.next/static
# Migrations, CLI config (resolves DATA_DIR through lib/paths.ts), version shown by the entrypoint.
COPY prisma ./prisma
COPY prisma.config.ts package.json tsconfig.json ./
# Uploaded to every site at dump time, read from <cwd>/helpers.
COPY helpers ./helpers
# Operator scripts (import-config, reset-password) run through tsx and import lib/, including the generated client.
COPY scripts ./scripts
COPY lib ./lib
COPY --from=prod-deps /app/lib/generated ./lib/generated
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /data

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode) })"

ENTRYPOINT ["dumb-init", "--"]
CMD ["./docker-entrypoint.sh"]
