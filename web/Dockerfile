# ==============================================================================
# web — Next.js storefront + admin, self-hosted on our VPS
# ==============================================================================
# Build context is the REPO ROOT (npm-workspaces monorepo: web consumes the
# `shared` workspace as TS source via transpilePackages).
#   docker build -f web/Dockerfile .
#
# next.config.ts sets output:'standalone', so the build emits a self-contained
# server under web/.next/standalone — with the monorepo root as its root, i.e.
# standalone/web/server.js plus a traced standalone/node_modules.
#
# NEXT_PUBLIC_* are inlined into the browser bundle at BUILD time and cannot be
# changed later by env — they are build args. API_URL is server-side only and
# stays a runtime env var (see deploy/docker-compose.yml).

# ---- base: workspace manifests only ------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY web/package.json web/

# ---- build -------------------------------------------------------------------
FROM base AS build
RUN npm ci -w web -w shared
COPY tsconfig.base.json ./
COPY shared/src shared/src
COPY web web

ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_METRIKA_ID
ARG API_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_METRIKA_ID=$NEXT_PUBLIC_METRIKA_ID \
    API_URL=$API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w web

# ---- runtime ------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build --chown=node:node /app/web/.next/standalone ./
COPY --from=build --chown=node:node /app/web/.next/static ./web/.next/static
COPY --from=build --chown=node:node /app/web/public ./web/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/ru" >/dev/null || exit 1

CMD ["node", "web/server.js"]
