import { describe, it, expect, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTryServer, clientIp, type TryServerOptions } from './server.js';
import type { TryScanResult } from './scan.js';

const RESULT: TryScanResult = {
  repo: 'a/b',
  packageManager: 'npm',
  counts: { outdated: 0, vulnerable: 0, deprecated: 0 },
  findings: [],
  upgrade: {
    available: false,
    summary: 'ok',
    stat: { files: 0, additions: 0, deletions: 0 },
    patch: '',
    commands: [],
  },
};

let server: Server | undefined;

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
});

async function start(opts: TryServerOptions): Promise<string> {
  server = createTryServer({ log: () => {}, ...opts });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('clientIp (X-Forwarded-For spoof resistance)', () => {
  const req = (xff?: string, socket = '10.0.0.1') =>
    ({
      headers: xff ? { 'x-forwarded-for': xff } : {},
      socket: { remoteAddress: socket },
    }) as never;

  it('reads the real client from the RIGHT, so a prepended IP cannot spoof it', () => {
    // Client sent "9.9.9.9"; the trusted proxy appended the true 1.1.1.1.
    expect(clientIp(req('9.9.9.9, 1.1.1.1'), 1)).toBe('1.1.1.1');
    expect(clientIp(req('1.1.1.1'), 1)).toBe('1.1.1.1');
  });

  it('honors multiple trusted hops and falls back to the socket', () => {
    expect(clientIp(req('client, edge2, edge1'), 2)).toBe('edge2');
    expect(clientIp(req(undefined, '10.0.0.9'), 1)).toBe('10.0.0.9');
    expect(clientIp(req('anything'), 0)).toBe('10.0.0.1'); // no proxies trusted → socket
  });
});

describe('try-api server', () => {
  it('rate-limits by the true client IP, not a forgeable prepended one', async () => {
    const url = await start({ trustedProxies: 1, rateLimit: 1, scan: async () => RESULT });
    const hit = (xff: string, repo: string) =>
      fetch(`${url}/api/try?repo=${repo}`, { headers: { 'x-forwarded-for': xff } });

    expect((await hit('9.9.9.9, 1.1.1.1', 'a/b')).status).toBe(200);
    // Same real IP (1.1.1.1) behind a different forged prefix → still limited.
    expect((await hit('8.8.8.8, 1.1.1.1', 'c/d')).status).toBe(429);
    // A genuinely different client IP gets its own bucket.
    expect((await hit('7.7.7.7, 2.2.2.2', 'e/f')).status).toBe(200);
  });

  it('sheds load with 503 when the queue is saturated instead of growing memory', async () => {
    let release!: () => void;
    const scan = (): Promise<TryScanResult> =>
      new Promise((resolve) => {
        release = () => resolve(RESULT);
      });
    const url = await start({ maxConcurrent: 1, maxQueue: 0, rateLimit: 100, scan });

    const inflight = fetch(`${url}/api/try?repo=a/b`); // takes the only slot, hangs in scan
    await new Promise((r) => setTimeout(r, 50));
    const busy = await fetch(`${url}/api/try?repo=c/d`); // queue full → shed
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).toBe('30');

    release();
    expect((await inflight).status).toBe(200);
  });

  it('sets security headers on every response', async () => {
    const url = await start({ scan: async () => RESULT });
    const res = await fetch(`${url}/health`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('answers 413 when a scan result exceeds the response cap', async () => {
    const url = await start({ maxResponseBytes: 10, rateLimit: 100, scan: async () => RESULT });
    expect((await fetch(`${url}/api/try?repo=a/b`)).status).toBe(413);
  });

  it('caches a repo result and serves repeats from cache', async () => {
    let calls = 0;
    const url = await start({
      rateLimit: 100,
      scan: async () => {
        calls++;
        return RESULT;
      },
    });
    await fetch(`${url}/api/try?repo=a/b`);
    const second = await fetch(`${url}/api/try?repo=a/b`);
    expect(calls).toBe(1);
    expect(second.headers.get('x-cache')).toBe('HIT');
  });

  it('handles health, unknown paths, method and missing-arg errors', async () => {
    const url = await start({ scan: async () => RESULT });
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/nope`)).status).toBe(404);
    expect((await fetch(`${url}/api/try`)).status).toBe(400); // no ?repo
    expect((await fetch(`${url}/api/try?repo=a/b`, { method: 'POST' })).status).toBe(405);
  });
});
