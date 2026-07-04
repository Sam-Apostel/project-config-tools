#!/usr/bin/env node
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { openProject } from '@visual-config/core';
import { startDaemon } from '@visual-config/server';

interface CliArgs {
  command?: string;
  cwd?: string;
  host?: string;
  port?: number;
  uiDir?: string;
  open: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { open: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--no-open') args.open = false;
    else if (arg === '--cwd') args.cwd = argv[++i];
    else if (arg === '--host') args.host = argv[++i];
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--ui-dir') args.uiDir = argv[++i];
    else if (!arg.startsWith('-') && !args.command) args.command = arg;
  }
  return args;
}

function resolveUiDir(override?: string): string | undefined {
  if (override) {
    const dir = resolve(override);
    return existsSync(join(dir, 'index.html')) ? dir : undefined;
  }
  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('@visual-config/ui/package.json');
    const dir = join(dirname(pkgPath), 'dist');
    return existsSync(join(dir, 'index.html')) ? dir : undefined;
  } catch {
    return undefined;
  }
}

function openBrowser(url: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  try {
    spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // best effort; the URL is printed regardless
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'mcp') {
    // stdio is the MCP protocol channel — do not write to stdout here.
    const root = resolve(args.cwd ?? process.cwd());
    const engine = await openProject(root);
    const { startStdioMcpServer } = await import('@visual-config/mcp');
    await startStdioMcpServer(engine);
    return;
  }

  const root = resolve(args.cwd ?? process.cwd());
  const engine = await openProject(root);
  const uiDir = resolveUiDir(args.uiDir);
  const daemon = await startDaemon({ engine, uiDir, host: args.host, port: args.port });
  const project = engine.getProject();

  console.log('');
  console.log(`  visual-config  →  ${daemon.url}`);
  console.log(`  project: ${project.name ?? root}  (${project.packageManager})`);
  if (!uiDir) {
    console.log('  note: no UI build found — run `pnpm build:ui`. Serving RPC only for now.');
  }
  console.log('');

  if (args.open && uiDir) openBrowser(daemon.url);

  const shutdown = async (): Promise<void> => {
    await daemon.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
