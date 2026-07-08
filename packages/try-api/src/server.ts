import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { scanRepo, type TryScanResult } from './scan.js';

export interface TryServerOptions {
  /** CORS allow-list. '*' (default) or a set of exact origins (e.g. https://visual-config.dev). */
  allowOrigin?: string | string[];
  /** Max scans running at once — git clones are heavy, so this bounds resource use. Default 4. */
  maxConcurrent?: number;
  /** Requests per IP per window. Default 20. */
  rateLimit?: number;
  /** Rate-limit window in ms. Default 60_000. */
  rateWindowMs?: number;
  /** How long a repo's result is cached (repeat pastes are common). Default 300_000. */
  cacheTtlMs?: number;
}

/** Fixed-window per-IP limiter — enough to blunt abuse; a CDN/WAF should sit in front in prod. */
class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}
  take(key: string, now: number): boolean {
    const e = this.hits.get(key);
    if (!e || now >= e.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (e.count >= this.limit) return false;
    e.count++;
    return true;
  }
  sweep(now: number): void {
    for (const [k, e] of this.hits) if (now >= e.resetAt) this.hits.delete(k);
  }
}

function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return (first ?? req.socket.remoteAddress ?? 'unknown').trim();
}

function resolveOrigin(allow: string | string[], reqOrigin: string | undefined): string | null {
  if (allow === '*') return '*';
  const list = Array.isArray(allow) ? allow : [allow];
  return reqOrigin && list.includes(reqOrigin) ? reqOrigin : (list[0] ?? null);
}

/**
 * The hosted playground's backend. One meaningful route — `GET /api/try?repo=owner/repo` —
 * plus `GET /health`. No framework: it's a thin, stateless transport over {@link scanRepo}.
 */
export function createTryServer(opts: TryServerOptions = {}): Server {
  const allowOrigin = opts.allowOrigin ?? '*';
  const maxConcurrent = opts.maxConcurrent ?? 4;
  const limiter = new RateLimiter(opts.rateLimit ?? 20, opts.rateWindowMs ?? 60_000);
  const cacheTtlMs = opts.cacheTtlMs ?? 300_000;
  const cache = new Map<string, { at: number; result: TryScanResult }>();

  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = (): Promise<void> =>
    new Promise((resolve) => {
      if (active < maxConcurrent) {
        active++;
        resolve();
      } else queue.push(resolve);
    });
  const release = (): void => {
    active--;
    const next = queue.shift();
    if (next) {
      active++;
      next();
    }
  };

  const sweeper = setInterval(() => {
    const now = Date.now();
    limiter.sweep(now);
    for (const [k, v] of cache) if (now - v.at > cacheTtlMs) cache.delete(k);
  }, 60_000);
  sweeper.unref();

  const server = createServer(
    (req, res) => void handle(req, res).catch(() => send(res, 500, { error: 'Internal error' })),
  );

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = resolveOrigin(allowOrigin, req.headers.origin);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname !== '/api/try') return send(res, 404, { error: 'Not found' });

    const repo = url.searchParams.get('repo')?.trim();
    if (!repo) return send(res, 400, { error: 'Pass ?repo=owner/repo' });

    if (!limiter.take(clientIp(req), Date.now())) {
      res.setHeader('Retry-After', '60');
      return send(res, 429, { error: 'Rate limit exceeded — try again in a minute.' });
    }

    const cached = cache.get(repo.toLowerCase());
    if (cached && Date.now() - cached.at < cacheTtlMs) {
      res.setHeader('X-Cache', 'HIT');
      return send(res, 200, cached.result);
    }

    await acquire();
    try {
      const result = await scanRepo(repo);
      cache.set(repo.toLowerCase(), { at: Date.now(), result });
      res.setHeader('Cache-Control', 'public, max-age=300');
      send(res, 200, result);
    } catch (err) {
      // parseRepo / clone / no-package.json failures are the caller's problem → 400.
      send(res, 400, { error: err instanceof Error ? err.message : 'Scan failed' });
    } finally {
      release();
    }
  }

  server.on('close', () => clearInterval(sweeper));
  return server;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(json);
}
