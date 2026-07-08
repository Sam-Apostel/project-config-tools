# Hosted playground backend for visual-config.
# Build from the REPO ROOT so the pnpm workspace (core is a workspace dep) is in context.
# Railway builds this via railway.json (RAILWAY dockerfilePath). Locally:
#   docker build -f packages/try-api/Dockerfile -t vc-try-api .
#
# The container clones public repos read-only and parses their config. It never runs the
# target repo's code, so it needs no secrets. Run it with a read-only root filesystem and a
# small tmpfs at /tmp for the throwaway clones (see the README).

# ---- build: bundle try-api (with core inlined) into one self-contained file ----
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
# Install deps first (cache layer) from just the manifests.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/try-api/package.json packages/try-api/
RUN pnpm install --frozen-lockfile --filter @apostel/visual-config-try-api...
COPY packages/core packages/core
COPY packages/try-api packages/try-api
# esbuild inlines core + workspace source into one CJS file; the heavy third-party deps
# (@babel/parser, jsonc-parser, diff, semver) stay external and are installed at runtime.
# The runtime package.json is DERIVED from core's dependencies, so it can never drift.
RUN pnpm --filter @apostel/visual-config-try-api bundle \
  && mkdir -p /out \
  && cp packages/try-api/dist/server.cjs /out/server.cjs \
  && node -e "const d=require('/app/packages/core/package.json').dependencies; require('fs').writeFileSync('/out/package.json', JSON.stringify({name:'visual-config-try-api-runtime',private:true,dependencies:d}, null, 2))"

# ---- runtime: node + git + the bundle and its few external deps ----
FROM node:22-slim
# git is the one runtime dependency beyond Node — it does the shallow clones.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Never let git prompt for credentials — a private/nonexistent repo must fail fast, not hang.
ENV GIT_TERMINAL_PROMPT=0 \
    NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build /out/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /out/server.cjs ./server.cjs
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.cjs"]
