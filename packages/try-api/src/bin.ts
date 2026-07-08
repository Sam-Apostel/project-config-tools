#!/usr/bin/env node
import { createTryServer } from './server.js';

/** Env-configured entrypoint for the container. See the package README for hosting. */
function main(): void {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const allowOrigin = process.env.ALLOW_ORIGIN
    ? process.env.ALLOW_ORIGIN.split(',').map((s) => s.trim())
    : '*';

  const server = createTryServer({ allowOrigin });
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
