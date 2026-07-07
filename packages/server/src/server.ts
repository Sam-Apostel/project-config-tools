import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { createBirpc, type BirpcReturn } from 'birpc';
import type { Engine } from '@apostel/visual-config-core';
import type { ProjectModel } from '@apostel/visual-config-core';
import type {
  ClientFunctions,
  FaceBootstrap,
  ServerFunctions,
  WorkspaceInfo,
} from '@apostel/visual-config-protocol';
import { TaskManager } from './tasks.js';
import { serveStatic } from './static.js';

export interface DaemonOptions {
  engine: Engine;
  /** Absolute path to the built SPA. Omit to run headless (RPC only). */
  uiDir?: string;
  host?: string;
  port?: number;
  /**
   * Re-open the engine rooted at an absolute path, for switching the active
   * workspace member. Omit to disable workspace switching (single-package mode).
   */
  openAt?: (root: string) => Promise<Engine>;
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
  // The engine rooted at the workspace root never changes; `engine` tracks the
  // currently-active member (starts as the root) and is swapped by setActivePackage.
  const rootEngine = opts.engine;
  let engine = opts.engine;
  const host = opts.host ?? '127.0.0.1';
  const token = randomUUID();
  const clients = new Set<Client>();

  const broadcast = (fn: (client: ClientFunctions) => void): void => {
    for (const client of clients) fn(client.rpc);
  };

  // Cache opened member engines (keyed by relative dir) so switching back and
  // forth is instant and each member keeps its own pending/undo state.
  const engineCache = new Map<string, Engine>();
  let activeDir = '';

  const workspaceInfo = (): WorkspaceInfo => {
    const root = rootEngine.getProject();
    return { rootName: root.name, packages: root.workspacePackages, active: activeDir };
  };

  /** Switch the active engine to a workspace member dir (relative to root, '' for root). */
  const setActivePackage = async (dir: string): Promise<ProjectModel> => {
    const rel = dir
      .replace(/\\/g, '/')
      .replace(/^\.?\/?/, '')
      .replace(/\/$/, '');
    if (rel === '' || rel === '.') {
      engine = rootEngine;
      activeDir = '';
      broadcast((c) => c.onProjectChanged(engine.getProject()));
      return engine.getProject();
    }
    const member = rootEngine.getProject().workspacePackages.find((p) => p.dir === rel);
    if (!member) throw new Error(`Unknown workspace package: ${dir}`);
    if (!opts.openAt) throw new Error('Workspace switching is not enabled for this daemon');

    let next = engineCache.get(rel);
    if (!next) {
      // Guard against path escapes: the resolved dir must stay under the root.
      const abs = resolve(join(rootEngine.root, rel));
      if (abs !== rootEngine.root && !abs.startsWith(rootEngine.root + '/')) {
        throw new Error(`Workspace package escapes the project root: ${dir}`);
      }
      next = await opts.openAt(abs);
      engineCache.set(rel, next);
    }
    engine = next;
    activeDir = rel;
    broadcast((c) => c.onProjectChanged(engine.getProject()));
    return engine.getProject();
  };

  const taskManager = new TaskManager(
    () => engine.root,
    () => engine.getProject().packageManager,
    {
      onOutput: (taskId, chunk) => broadcast((c) => c.onTaskOutput(taskId, chunk)),
      onExit: (taskId, code) => broadcast((c) => c.onTaskExit(taskId, code)),
    },
  );

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
      searchCatalog: (query) => engine.searchCatalog(query),
      getDiagnostics: () => engine.getDiagnostics(),
      getTsconfig: () => engine.getTsconfig(),
      getImprovements: async () => engine.getImprovements(),
      analyzeBump: (pkg, to) => engine.analyzeBump(pkg, to),
      getChangelog: (name, from, to) => engine.getChangelog(name, from, to),
      getConfigs: () => engine.getConfigs(),
      getConfig: (path) => engine.getConfig(path),
      getScaffolds: async () => engine.getScaffolds(),
      getWorkspace: async () => workspaceInfo(),
      setActivePackage: (dir) => setActivePackage(dir),
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
      // httpServer.close() waits for open connections to drain; the browser's
      // live WebSocket would keep it (and the process) alive forever — so on
      // Ctrl+C the daemon appeared to hang. Hang up clients and destroy any
      // lingering sockets first so close() actually resolves.
      for (const client of clients) client.ws.terminate();
      clients.clear();
      wss.close();
      httpServer.closeAllConnections?.();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
