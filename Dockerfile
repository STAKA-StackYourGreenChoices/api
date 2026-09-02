# syntax=docker/dockerfile:1.7

# ---------- deps ----------
FROM node:26-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm install --frozen-lockfile

# ---------- build ----------
FROM node:26-alpine AS build
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build
# Strip dev dependencies for the runtime layer. `prisma` is a PROD dependency on
# purpose: the deploy scripts run `prisma migrate deploy` inside this image.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && pnpm prune --prod

# ---------- runtime ----------
FROM node:26-alpine AS runtime
RUN apk add --no-cache dumb-init curl openssl && \
    addgroup -g 1001 -S nodejs && \
    adduser  -u 1001 -S nestjs -G nodejs
WORKDIR /app

ARG GIT_SHA=dev
ENV NODE_ENV=production PORT=3000 GIT_SHA=$GIT_SHA

COPY --from=build --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nodejs /app/dist         ./dist
COPY --from=build --chown=nestjs:nodejs /app/generated     ./generated
COPY --from=build --chown=nestjs:nodejs /app/prisma       ./prisma
COPY --from=build --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs
EXPOSE 3000

# Hits the dependency-free liveness route, never the DB-backed readiness one.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/health/live || exit 1

# dumb-init makes PID 1 forward SIGTERM so enableShutdownHooks() actually fires.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
