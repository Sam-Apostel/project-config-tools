# @apostel/visual-config-try-api

The backend behind the marketing site's **hosted playground** (`site/index.html#try`).
Point it at a public GitHub repo; it clones the repo read-only, runs the real
`@apostel/visual-config-core` engine against it, and returns the dependency-health findings
plus a format-preserving upgrade diff as JSON.

This is the same scan the CLI does with `npx @apostel/visual-config try <owner/repo>` — just
exposed over HTTP so the browser playground can call it. Private (not published to npm); it's
a deployable service, not a library.

## API

```
GET /health                       → 200 { "ok": true }
GET /api/try?repo=owner/repo       → 200 TryScanResult | 400 { error } | 429 { error }
```

`repo` accepts `owner/repo`, `github.com/owner/repo`, or a full HTTPS URL.

```jsonc
{
  "repo": "sindresorhus/slugify",
  "name": "@sindresorhus/slugify",
  "packageManager": "npm",
  "counts": { "outdated": 3, "vulnerable": 0, "deprecated": 0 },
  "findings": [
    {
      "kind": "outdated",
      "target": "xo",
      "message": "1.2.2 → 4.0.0 (major)",
      "severity": "warn",
      "latest": "4.0.0",
    },
  ],
  "upgrade": {
    "available": true,
    "summary": "Upgrade 3 dependencies to latest",
    "stat": { "files": 1, "additions": 3, "deletions": 3 },
    "patch": "Index: package.json\n===…\n--- package.json\n+++ package.json\n@@ …",
    "commands": ["npm install"],
  },
}
```

## Why it's safe to host on arbitrary public repos

The engine only **reads and statically parses** config files. It never imports or executes the
target repo's code:

- No plugins are discovered or loaded (`openProject(dir, { plugins: [], journalPath: null })`).
- No operation is ever _applied_ and no command is ever _run_ — planning only produces a diff.
- Framework configs (`eslint.config.js`, `vite.config.ts`, …) are parsed with `@babel/parser`,
  never `import`ed.
- The cloner is only ever handed a canonical `https://github.com/<owner>/<repo>.git` URL rebuilt
  from the parsed parts, so a caller can't redirect it at an internal host (no SSRF).

The only outbound traffic is `git clone` from github.com and the npm registry reads that
diagnostics needs. Nothing is written to the target repo — the output is a diff you review.

## Run it locally

```bash
pnpm --filter @apostel/visual-config-try-api build
PORT=8080 node packages/try-api/dist/bin.js
# or, no build step:
pnpm --filter @apostel/visual-config-try-api exec tsx src/bin.ts

curl "http://127.0.0.1:8080/api/try?repo=sindresorhus/slugify"
```

Environment:

| var            | default   | meaning                                                          |
| -------------- | --------- | ---------------------------------------------------------------- |
| `PORT`         | `8080`    | listen port                                                      |
| `HOST`         | `0.0.0.0` | listen address                                                   |
| `ALLOW_ORIGIN` | `*`       | CORS allow-list; comma-separated origins (e.g. your site's URL). |

The server also enforces per-IP rate limiting (20 req/min), a concurrency cap (4 clones at a
time), and a 5-minute per-repo cache — see `TryServerOptions` if you embed `createTryServer`.

## Hosting

It's a single stateless Node container that needs **Node ≥20** and **git**. Any container host
works. Build from the **repo root** (the pnpm workspace must be in the Docker context):

```bash
docker build -f packages/try-api/Dockerfile -t vc-try-api .
docker run --rm -p 8080:8080 \
  --read-only --tmpfs /tmp:rw,size=512m,noexec \
  --memory 512m --cpus 1 --pids-limit 256 \
  -e ALLOW_ORIGIN=https://your-site.example \
  vc-try-api
```

Those runtime flags are the hardening that matters: a **read-only root filesystem** with a small
**`noexec` tmpfs** for the throwaway clones (so nothing pulled down can be written elsewhere or
executed), plus memory/CPU/PID caps to bound a hostile or huge repo.

### Platform quickstarts

- **Fly.io** — `fly launch --dockerfile packages/try-api/Dockerfile` (run from the repo root),
  set `[http_service] internal_port = 8080`, `fly secrets set ALLOW_ORIGIN=https://your-site`,
  then `fly deploy`. Scale to a shared-cpu-1x/512MB; add `[[http_service.concurrency]]` limits.
- **Railway** — new service → Deploy from repo → set the Dockerfile path to
  `packages/try-api/Dockerfile` and the build context to the repo root; add the `ALLOW_ORIGIN`
  variable. Railway injects `PORT`, which the server already honors.
- **Google Cloud Run** — `gcloud run deploy vc-try-api --source .` with the Dockerfile at that
  path; set `--max-instances`, `--concurrency 8`, `--memory 512Mi`, `--cpu 1`, and the
  `ALLOW_ORIGIN` env var. Cloud Run's per-request timeout doubles as a scan timeout.
- **Render** — a Docker web service pointed at this Dockerfile, health check path `/health`.

### Put a CDN / WAF in front

The built-in limiter is a backstop, not a front door. In production, terminate at Cloudflare (or
your platform's edge): cache `GET /api/try` responses (they send `Cache-Control: max-age=300`),
add edge rate-limiting per IP, and optionally restrict egress so the container can only reach
`github.com` and `registry.npmjs.org`.

## Wiring the homepage to it

The playground in `site/index.html` currently runs a **simulation** with representative findings.
To make it live, have its `analyze()` call this endpoint when one is configured, e.g.:

```js
const ENDPOINT = window.VC_TRY_ENDPOINT; // e.g. 'https://try.visual-config.dev'
const res = await fetch(`${ENDPOINT}/api/try?repo=${encodeURIComponent(repo.value)}`);
const data = await res.json(); // { findings, upgrade, counts, … }
```

Map `data.findings` onto the finding chips and render `data.upgrade.patch` in the diff pane. Keep
the simulation as the fallback for when no endpoint is set, so the static site still demos offline.
