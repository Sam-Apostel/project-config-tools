# Hosted playground backend for visual-config.
# Build from the REPO ROOT so the pnpm workspace (core is a workspace dep) is in context:
#   docker build -f packages/try-api/Dockerfile -t vc-try-api .
#
# The container clones public repos read-only and parses their config. It never runs the
# target repo's code, so it needs no secrets. Run it with a read-only root filesystem and a
# small tmpfs at /tmp for the throwaway clones (see the README).

# ---- build ----
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/try-api/package.json packages/try-api/
RUN pnpm install --frozen-lockfile --filter @apostel/visual-config-try-api...
COPY packages/core packages/core
COPY packages/try-api packages/try-api
RUN pnpm --filter @apostel/visual-config-core build \
  && pnpm --filter @apostel/visual-config-try-api build \
  && pnpm --filter @apostel/visual-config-try-api --prod deploy /out

# ---- runtime ----
FROM node:22-slim
# git is the one runtime dependency beyond Node — it does the shallow clones.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# Never let git prompt for credentials — a private/nonexistent repo must fail fast, not hang.
ENV GIT_TERMINAL_PROMPT=0 \
    NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build /out /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/bin.js"]
