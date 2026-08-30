import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { scanRepo, type TryScanResult } from './scan.js';

export interface TryServerOptions {
  /** CORS allow-list. '*' (default) or a set of exact origins (e.g. https://visual-config.dev). */
  allowOrigin?: string | string[];
  /** Max scans running at once — git clones are heavy, so this bounds resource use. Default 4. */
  maxConcurrent?: number;
  /** Max requests waiting for a scan slot before we shed load with 503. Default 20. */
  maxQueue?: number;
  /**
   * Trusted reverse-proxy hops in front of this server (e.g. Railway's edge = 1).
   * The client IP is read that many entries from the RIGHT of X-Forwarded-For, so a
   * client can't forge a fresh IP by prepending one. 0 = read the socket directly.
   * Default 1.
   */
  trustedProxies?: number;
  /** Requests per IP per window. Default 20. */
  rateLimit?: number;
  /** Rate-limit window in ms. Default 60_000. */
  rateWindowMs?: number;
  /** How long a repo's result is cached (repeat pastes are common). Default 300_000. */
  cacheTtlMs?: number;
  /** Cap on a serialized scan result; larger results answer 413. Default 1_000_000. */
  maxResponseBytes?: number;
  /** The scan implementation (injected in tests). Default the real {@link scanRepo}. */
  scan?: (repo: string) => Promise<TryScanResult>;
  /** One-line structured request log sink. Default: a JSON line to stdout. */
  log?: (entry: Record<string, unknown>) => void;
}

/** Fixed-window per-IP limiter — the app-level abuse control (Railway has no edge WAF). */
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

/**
 * The real client IP, resilient to a forged `X-Forwarded-For`. Each proxy in the
 * chain appends the address it received the connection from, so with `trustedProxies`
 * hops in front, the genuine client is that many entries from the right — everything
 * to its left is caller-supplied and must not be trusted for rate limiting.
 */
export function clientIp(req: IncomingMessage, trustedProxies: number): string {
  const socket = req.socket.remoteAddress ?? 'unknown';
  if (trustedProxies <= 0) return socket;
  const raw = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - trustedProxies] ?? socket;
}

function resolveOrigin(allow: string | string[], reqOrigin: string | undefined): string | null {
  if (allow === '*') return '*';
  const list = Array.isArray(allow) ? allow : [allow];
  return reqOrigin && list.includes(reqOrigin) ? reqOrigin : (list[0] ?? null);
}

function defaultLog(entry: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(entry) + '\n');
}

/**
 * The hosted playground's backend. One meaningful route — `GET /api/try?repo=owner/repo` —
 * plus `GET /health`. A thin, stateless transport over {@link scanRepo}, hardened at the
 * app level (spoof-resistant rate limiting, bounded concurrency + load shedding, response
 * cap, security headers, structured logs) since no edge WAF sits in front.
 */
export function createTryServer(opts: TryServerOptions = {}): Server {
  const allowOrigin = opts.allowOrigin ?? '*';
  const maxConcurrent = opts.maxConcurrent ?? 4;
  const maxQueue = opts.maxQueue ?? 20;
  const trustedProxies = opts.trustedProxies ?? 1;
  const limiter = new RateLimiter(opts.rateLimit ?? 20, opts.rateWindowMs ?? 60_000);
  const cacheTtlMs = opts.cacheTtlMs ?? 300_000;
  const maxResponseBytes = opts.maxResponseBytes ?? 1_000_000;
  const scan = opts.scan ?? scanRepo;
  const log = opts.log ?? defaultLog;
  const cache = new Map<string, { at: number; result: TryScanResult }>();

  // Bounded work pool: hand a freed slot straight to the next waiter (so `active`
  // stays put on hand-off), and reject once the queue is full instead of growing it.
  let active = 0;
  const queue: Array<(granted: boolean) => void> = [];
  const acquire = (): Promise<boolean> => {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve(true);
    }
    if (queue.length >= maxQueue) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => queue.push(resolve));
  };
  const release = (): void => {
    const next = queue.shift();
    if (next) next(true);
    else active--;
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
    const startedAt = Date.now();
    const ip = clientIp(req, trustedProxies);
    const url = new URL(req.url ?? '/', 'http://localhost');
    let cacheState: 'HIT' | 'MISS' | undefined;

    // Security headers + CORS on every response.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const origin = resolveOrigin(allowOrigin, req.headers.origin);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    res.on('finish', () =>
      log({
        t: new Date(startedAt).toISOString(),
        ip,
        method: req.method,
        path: url.pathname,
        status: res.statusCode,
        ms: Date.now() - startedAt,
        repo: url.searchParams.get('repo') ?? undefined,
        cache: cacheState,
      }),
    );

    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname !== '/api/try') return send(res, 404, { error: 'Not found' });

    const repo = url.searchParams.get('repo')?.trim();
    if (!repo) return send(res, 400, { error: 'Pass ?repo=owner/repo' });

    if (!limiter.take(ip, Date.now())) {
      res.setHeader('Retry-After', '60');
      return send(res, 429, { error: 'Rate limit exceeded — try again in a minute.' });
    }

    const cached = cache.get(repo.toLowerCase());
    if (cached && Date.now() - cached.at < cacheTtlMs) {
      cacheState = 'HIT';
      res.setHeader('X-Cache', 'HIT');
      return send(res, 200, cached.result);
    }
    cacheState = 'MISS';

    if (!(await acquire())) {
      res.setHeader('Retry-After', '30');
      return send(res, 503, { error: 'Server busy — try again shortly.' });
    }
    try {
      const result = await scan(repo);
      const json = JSON.stringify(result);
      if (json.length > maxResponseBytes) {
        return send(res, 413, { error: 'This repository’s result is too large to preview.' });
      }
      cache.set(repo.toLowerCase(), { at: Date.now(), result });
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(json);
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
