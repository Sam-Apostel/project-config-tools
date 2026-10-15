#!/usr/bin/env node
import { createTryServer } from './server.js';

/** Optional positive-integer env var (falls back to the server's own default). */
function numEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Env-configured entrypoint for the container. See the package README for hosting. */
function main(): void {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const allowOrigin = process.env.ALLOW_ORIGIN
    ? process.env.ALLOW_ORIGIN.split(',').map((s) => s.trim())
    : '*';

  const server = createTryServer({
    allowOrigin,
    maxConcurrent: numEnv('MAX_CONCURRENT'),
    maxQueue: numEnv('MAX_QUEUE'),
    trustedProxies: numEnv('TRUSTED_PROXIES'),
    rateLimit: numEnv('RATE_LIMIT'),
    rateWindowMs: numEnv('RATE_WINDOW_MS'),
    cacheTtlMs: numEnv('CACHE_TTL_MS'),
    maxResponseBytes: numEnv('MAX_RESPONSE_BYTES'),
  });
  server.listen(port, host, () => {
    process.stdout.write(`visual-config try-api listening on http://${host}:${port}\n`);
  });

  const shutdown = (): void => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
