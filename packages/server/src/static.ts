import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FaceBootstrap } from '@apostel/visual-config-protocol';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Serve the built SPA with an index.html fallback (client-side routing) and
 * inject the {@link FaceBootstrap} so the app knows how to reach its daemon.
 */
export async function serveStatic(
  uiDir: string,
  bootstrap: FaceBootstrap,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
  const requested = join(uiDir, normalize(urlPath));

  // Path-traversal guard: never serve outside uiDir.
  if (requested !== uiDir && !requested.startsWith(uiDir + '/')) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let filePath = requested;
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    // Missing file → SPA fallback to index.html.
    filePath = join(uiDir, 'index.html');
  }

  let body: Buffer;
  try {
    body = await readFile(filePath);
  } catch {
    res.writeHead(404).end('Not found');
    return;
  }

  const ext = extname(filePath);
  if (ext === '.html') {
    const inject = `<script>window.__VC__=${JSON.stringify(bootstrap)}</script>`;
    const html = body.toString('utf8').replace('</head>', `${inject}</head>`);
    res.writeHead(200, { 'content-type': MIME['.html'] });
    res.end(html);
    return;
  }

  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
  res.end(body);
}
