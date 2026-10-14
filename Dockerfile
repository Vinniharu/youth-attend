# syntax=docker/dockerfile:1

# ---- deps: install exactly what the lockfile pins ----
FROM node:22-alpine AS deps
WORKDIR /app
# .git isn't in the build context, so skip the husky install from `prepare`.
ENV HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci

# ---- migrator: one-shot DB migrations (no Next build needed) ----
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/migrate.mjs ./scripts/
COPY src/db/migrations ./src/db/migrations
USER node
CMD ["node", "scripts/migrate.mjs"]

# ---- builder: produce the standalone Next.js server ----
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal image, non-root ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
# Migrations run in the separate `migrate` compose service (migrator stage).
CMD ["node", "server.js"]
