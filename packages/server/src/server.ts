import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { createBirpc, type BirpcReturn } from 'birpc';
import type { Engine } from '@visual-config/core';
import type { ClientFunctions, FaceBootstrap, ServerFunctions } from '@visual-config/protocol';
import { TaskManager } from './tasks.js';
import { serveStatic } from './static.js';

export interface DaemonOptions {
  engine: Engine;
  /** Absolute path to the built SPA. Omit to run headless (RPC only). */
  uiDir?: string;
  host?: string;
  port?: number;
}

export interface Daemon {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

type Client = { rpc: BirpcReturn<ClientFunctions, ServerFunctions>; ws: WebSocket };

/**
 * Start the local daemon: HTTP (static SPA) + WebSocket (birpc). Bound to
 * localhost and gated by a per-session token, per the MCP local-server
 * hardening guidance.
 */
export async function startDaemon(opts: DaemonOptions): Promise<Daemon> {
  const engine = opts.engine;
  const host = opts.host ?? '127.0.0.1';
  const token = randomUUID();
  const clients = new Set<Client>();

  const broadcast = (fn: (client: ClientFunctions) => void): void => {
    for (const client of clients) fn(client.rpc);
  };

  const taskManager = new TaskManager(engine.root, () => engine.getProject().packageManager, {
    onOutput: (taskId, chunk) => broadcast((c) => c.onTaskOutput(taskId, chunk)),
    onExit: (taskId, code) => broadcast((c) => c.onTaskExit(taskId, code)),
  });

  const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    if (!opts.uiDir) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('visual-config daemon running (no UI build). Connect a face via /__rpc.');
      return;
    }
    const hostHeader = req.headers.host ?? `${host}:${opts.port ?? ''}`;
    const bootstrap: FaceBootstrap = {
      wsUrl: `ws://${hostHeader}/__rpc?token=${token}`,
      token,
    };
    void serveStatic(opts.uiDir, bootstrap, req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end('Internal error');
    });
  });

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
    if (url.pathname !== '/__rpc' || url.searchParams.get('token') !== token) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => setupConnection(ws));
  });

  function setupConnection(ws: WebSocket): void {
    const serverFunctions: ServerFunctions = {
      getProject: async () => engine.getProject(),
      listOperations: async () => engine.listOperations(),
      planOperation: async (operationId, input) => {
        try {
          const change = await engine.plan(operationId, input);
          return { ok: true, change };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
      applyChange: async (changeId) => {
        const result = await engine.apply(changeId);
        broadcast((c) => c.onProjectChanged(engine.getProject()));
        return result;
      },
      undo: async (entryId) => {
        const result = await engine.undo(entryId);
        broadcast((c) => c.onProjectChanged(engine.getProject()));
        return result;
      },
      listJournal: async () => engine.listJournal(),
      runScript: async (name) => ({ taskId: taskManager.run(name), script: name }),
      stopScript: async (taskId) => taskManager.stop(taskId),
    };

    const rpc = createBirpc<ClientFunctions, ServerFunctions>(serverFunctions, {
      post: (data) => ws.send(data),
      on: (fn) => ws.on('message', (raw: Buffer) => fn(raw.toString())),
      serialize: (v) => JSON.stringify(v),
      deserialize: (v) => JSON.parse(v as string),
    });

    const client: Client = { rpc, ws };
    clients.add(client);
    ws.on('close', () => clients.delete(client));
  }

  await new Promise<void>((resolve) => httpServer.listen(opts.port ?? 0, host, resolve));
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : (opts.port ?? 0);

  return {
    url: `http://${host}:${port}`,
    port,
    token,
    close: async () => {
      taskManager.stopAll();
      wss.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
