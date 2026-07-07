#!/usr/bin/env node
import { resolve, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { openProject, discoverPlugins } from '@apostel/visual-config-core';
import { startDaemon } from '@apostel/visual-config-server';

interface CliArgs {
  command?: string;
  target?: string;
  cwd?: string;
  host?: string;
  port?: number;
  uiDir?: string;
  open: boolean;
  plugins: boolean;
  client?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { open: true, plugins: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--no-open') args.open = false;
    else if (arg === '--no-plugins') args.plugins = false;
    else if (arg === '--cwd') args.cwd = argv[++i];
    else if (arg === '--host') args.host = argv[++i];
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--ui-dir') args.uiDir = argv[++i];
    else if (arg === '--client') args.client = argv[++i];
    else if (!arg.startsWith('-') && !args.command) args.command = arg;
    else if (!arg.startsWith('-') && !args.target) args.target = arg;
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
    const pkgPath = require.resolve('@apostel/visual-config-ui/package.json');
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

  if (args.command === 'try') {
    // Prototype of the hosted flow: point at a public GitHub repo, get a patch.
    if (!args.target) {
      console.error('Usage: visual-config try <owner/repo>   (e.g. sindresorhus/got)');
      process.exit(1);
    }
    const { tryRemote } = await import('./try-remote.js');
    await tryRemote(args.target);
    return;
  }

  if (args.command === 'mcp') {
    // stdio is the MCP protocol channel — do not write to stdout here.
    const root = resolve(args.cwd ?? process.cwd());
    const plugins = args.plugins ? await discoverPlugins(root) : [];
    const engine = await openProject(root, { plugins });
    const { startStdioMcpServer } = await import('@apostel/visual-config-mcp');
    await startStdioMcpServer(engine);
    return;
  }

  if (args.command === 'init-mcp') {
    const root = resolve(args.cwd ?? process.cwd());
    const engine = await openProject(root, { plugins: [], journalPath: null });
    const clients =
      !args.client || args.client === 'all' ? ['claude', 'cursor', 'vscode'] : [args.client];
    const change = await engine.plan('add-mcp-config', { clients });
    const result = await engine.apply(change.id);
    if (result.ok) {
      console.log(`\n  Registered the visual-config MCP server for: ${clients.join(', ')}`);
      for (const edit of change.edits) console.log(`    ${edit.path}`);
      console.log('\n  Agents opening this repo can now run `npx @apostel/visual-config mcp`.\n');
    } else {
      console.error(`Failed: ${result.errors.join('; ')}`);
      process.exit(1);
    }
    return;
  }

  const root = resolve(args.cwd ?? process.cwd());
  const plugins = args.plugins ? await discoverPlugins(root) : [];
  const engine = await openProject(root, { plugins });
  const uiDir = resolveUiDir(args.uiDir);
  // Let the daemon re-open the engine at a workspace member on demand. Each
  // member discovers its own plugins so a package's local config is honored.
  const openAt = async (memberRoot: string) =>
    openProject(memberRoot, {
      plugins: args.plugins ? await discoverPlugins(memberRoot) : [],
    });
  const daemon = await startDaemon({ engine, uiDir, host: args.host, port: args.port, openAt });
  const project = engine.getProject();

  console.log('');
  console.log(`  visual-config  →  ${daemon.url}`);
  console.log(`  project: ${project.name ?? root}  (${project.packageManager})`);
  if (plugins.length > 0) {
    console.log(`  plugins: ${plugins.map((p) => p.id).join(', ')}`);
  }
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
