import { relative } from 'node:path';
import type { FileSystem } from '../types.js';
import type { UsageMap, UsageSite } from './types.js';

const SOURCE_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
}

function matchesPackage(specifier: string, pkg: string): 'import' | 'subpath-import' | null {
  if (specifier === pkg) return 'import';
  if (specifier.startsWith(`${pkg}/`)) return 'subpath-import';
  return null;
}

/** Parse an import/require clause into the identifiers it brings in. */
export function parseClause(clause: string): string[] {
  const out: string[] = [];
  if (/\*\s*as\s+[\w$]+/.test(clause)) out.push('*');

  const braces = clause.match(/\{([^}]*)\}/);
  const outside = clause
    .replace(/\{[^}]*\}/, '')
    .replace(/\*\s*as\s+[\w$]+/, '')
    .replace(/,/g, ' ')
    .trim();
  if (outside && /^[A-Za-z_$]/.test(outside) && !out.includes('*')) out.push('default');

  if (braces?.[1]) {
    for (const part of braces[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]!
        .trim();
      if (name) out.push(name);
    }
  }
  return out;
}

/**
 * Build a static import map of how the app uses `pkg` — which exports are
 * imported and where. Import-level (not a full call graph), and deliberately
 * conservative: a namespace import (`* as x`) marks '*' meaning "any export
 * could be used". Deterministic, no network.
 */
export async function scanUsage(fs: FileSystem, root: string, pkg: string): Promise<UsageMap> {
  const files = (await fs.walk(root)).filter((f) => SOURCE_RE.test(f) && !f.endsWith('.d.ts'));
  const sites: UsageSite[] = [];
  const symbols = new Set<string>();

  const add = (
    file: string,
    index: number,
    text: string,
    imported: string[],
    kind: UsageSite['kind'],
  ) => {
    imported.forEach((s) => symbols.add(s));
    sites.push({ file: relative(root, file), line: lineAt(text, index), imported, kind });
  };

  for (const file of files) {
    let text: string;
    try {
      text = await fs.readFile(file);
    } catch {
      continue;
    }

    // `import <clause> from '<spec>'`
    const importRe = /import\s+(?:type\s+)?([^;]*?)\s+from\s+['"]([^'"]+)['"]/gs;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(text))) {
      const kind = matchesPackage(m[2]!, pkg);
      if (kind) add(file, m.index, text, parseClause(m[1]!), kind);
    }

    // side-effect `import '<spec>'`
    const sideRe = /import\s+['"]([^'"]+)['"]/g;
    while ((m = sideRe.exec(text))) {
      const kind = matchesPackage(m[1]!, pkg);
      if (kind) add(file, m.index, text, [], kind);
    }

    // `[const X =] require('<spec>')`
    const reqRe = /(?:(?:const|let|var)\s+([^=;]+?)\s*=\s*)?require\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((m = reqRe.exec(text))) {
      if (matchesPackage(m[2]!, pkg))
        add(file, m.index, text, m[1] ? parseClause(m[1]) : [], 'require');
    }
  }

  return { package: pkg, used: sites.length > 0, symbols: [...symbols], sites };
}
