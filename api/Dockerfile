# ==============================================================================
# api — Railway deploy image (long-lived Node service)
# ==============================================================================
# Build context is the REPO ROOT (npm-workspaces monorepo: api depends on the
# `shared` workspace, consumed as TS source). On Railway set:
#   Root Directory   = /
#   Dockerfile Path  = api/Dockerfile
# Local equivalent:  docker build -f api/Dockerfile .
#
# Layout notes (validated by running this exact sequence locally):
# - `npm ci -w api -w shared` needs every workspace's package.json present
#   (including web/) for lockfile validation, but installs only api+shared deps.
# - `npm run build -w api` (tsc, rootDir=src, outDir=dist) emits api/dist/index.js.
# - api imports from @ximi4ka-shop/shared are all `import type`, so dist has NO
#   runtime dependency on shared; shared/src is still copied into the runtime
#   stage so the node_modules workspace symlink stays valid.
# - UPLOADS_DIR resolves module-relative (api/dist/lib/storage → ../../.. →
#   /app/api/uploads); uploads/imported/ is a git-tracked repo asset served at
#   /uploads/imported/... and must ship in the image. Railway's filesystem is
#   ephemeral — runtime-uploaded files do not survive redeploys.

# ---- base: workspace manifests only (shared by build + prod-deps) -----------
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY web/package.json web/

# ---- build: dev deps + tsc ---------------------------------------------------
FROM base AS build
RUN npm ci -w api -w shared
COPY tsconfig.base.json ./
COPY shared/src shared/src
COPY api/tsconfig.json api/
COPY api/src api/src
RUN npm run build -w api

# ---- prod-deps: production node_modules only ---------------------------------
FROM base AS prod-deps
RUN npm ci -w api -w shared --omit=dev

# ---- runtime ------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Root + workspace-local node_modules (npm hoists most deps to the root, but
# keeps conflicting versions under api/node_modules).
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/api/node_modules ./api/node_modules
COPY package.json ./
COPY api/package.json api/
COPY shared/package.json shared/
COPY shared/src shared/src
COPY --from=build /app/api/dist api/dist
# Git-tracked product photos (served at /uploads/imported/...). --chown so the
# non-root user can write runtime uploads next to them.
COPY --chown=node:node api/uploads api/uploads

USER node

# The app reads PORT at runtime (Railway injects it); 3001 is the default.
EXPOSE 3001
# Railway uses its own healthcheckPath (/health); this covers other environments.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health" || exit 1

CMD ["node", "api/dist/index.js"]
