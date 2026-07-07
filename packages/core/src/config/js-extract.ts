import { parse } from '@babel/parser';

/** Result of statically reading a JS/TS config module (read-only, best-effort). */
export interface JsConfigExtract {
  /** Top-level options whose values are static literals. */
  values: Record<string, unknown>;
  /** Keys present but not statically readable (functions, imports, spreads, …). */
  dynamicKeys: string[];
  /** True when we couldn't locate the exported config object at all. */
  opaque: boolean;
}

// Babel nodes are loosely typed here — we only ever read `.type` and a few
// well-known fields, guarded before use.
type Node = { type: string; [k: string]: unknown };
const n = (v: unknown): Node => v as Node;

/** Try to read a node as a JSON-ish literal; { ok:false } if it's dynamic. */
function literal(node: Node): { ok: true; value: unknown } | { ok: false } {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return { ok: true, value: node.value };
    case 'NullLiteral':
      return { ok: true, value: null };
    case 'UnaryExpression': {
      const arg = n(node.argument);
      if (node.operator === '-' && arg.type === 'NumericLiteral') {
        return { ok: true, value: -(arg.value as number) };
      }
      return { ok: false };
    }
    case 'ArrayExpression': {
      const out: unknown[] = [];
      for (const el of (node.elements as unknown[]) ?? []) {
        if (!el) return { ok: false };
        const r = literal(n(el));
        if (!r.ok) return { ok: false };
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    case 'ObjectExpression': {
      const obj = objectLiteral(node);
      return obj ? { ok: true, value: obj } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

/** A whole object literal, or null if any part is non-literal. */
function objectLiteral(node: Node): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const raw of (node.properties as unknown[]) ?? []) {
    const prop = n(raw);
    if (prop.type !== 'ObjectProperty') return null;
    const key = propKey(prop);
    if (key === null) return null;
    const r = literal(n(prop.value));
    if (!r.ok) return null;
    out[key] = r.value;
  }
  return out;
}

function propKey(prop: Node): string | null {
  if (prop.computed) return null;
  const key = n(prop.key);
  if (key.type === 'Identifier') return key.name as string;
  if (key.type === 'StringLiteral') return key.value as string;
  if (key.type === 'NumericLiteral') return String(key.value);
  return null;
}

/** Split an object's top-level properties into readable literals vs dynamic keys. */
function splitTopLevel(obj: Node): { values: Record<string, unknown>; dynamicKeys: string[] } {
  const values: Record<string, unknown> = {};
  const dynamicKeys: string[] = [];
  for (const raw of (obj.properties as unknown[]) ?? []) {
    const prop = n(raw);
    if (prop.type === 'SpreadElement') {
      dynamicKeys.push('…spread');
      continue;
    }
    const key = propKey(prop);
    if (prop.type === 'ObjectMethod') {
      dynamicKeys.push(key ?? '(method)');
      continue;
    }
    if (prop.type !== 'ObjectProperty' || key === null) continue;
    const r = literal(n(prop.value));
    if (r.ok) values[key] = r.value;
    else dynamicKeys.push(key);
  }
  return { values, dynamicKeys };
}

/** Peel `satisfies`/`as`/parentheses off an expression. */
function unwrap(node: Node): Node {
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return unwrap(n(node.expression));
  }
  return node;
}

/** The config object from an export value: `{…}` or `defineConfig({…})`. */
function configObjectFrom(expr: Node): Node | null {
  const e = unwrap(expr);
  if (e.type === 'ObjectExpression') return e;
  if (e.type === 'CallExpression') {
    for (const arg of (e.arguments as unknown[]) ?? []) {
      const a = unwrap(n(arg));
      if (a.type === 'ObjectExpression') return a;
    }
  }
  return null;
}

function isModuleExports(node: Node): boolean {
  if (node.type !== 'MemberExpression') return false;
  const obj = n(node.object);
  const prop = n(node.property);
  return obj.type === 'Identifier' && obj.name === 'module' && prop.name === 'exports';
}

/**
 * Statically read a JS/TS config file's top-level literal options. Handles
 * `export default {…}`, `export default defineConfig({…})`, `… satisfies X`, and
 * `module.exports = …`. Never throws — an unparseable or fully-dynamic file
 * returns `opaque: true`.
 */
export function extractJsConfig(code: string): JsConfigExtract {
  let ast;
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  } catch {
    return { values: {}, dynamicKeys: [], opaque: true };
  }
  let obj: Node | null = null;
  for (const raw of ast.program.body as unknown[]) {
    const stmt = n(raw);
    if (stmt.type === 'ExportDefaultDeclaration') {
      obj = configObjectFrom(n(stmt.declaration));
      if (obj) break;
    } else if (stmt.type === 'ExpressionStatement') {
      const ex = n(stmt.expression);
      if (ex.type === 'AssignmentExpression' && isModuleExports(n(ex.left))) {
        obj = configObjectFrom(n(ex.right));
        if (obj) break;
      }
    }
  }
  if (!obj) return { values: {}, dynamicKeys: [], opaque: true };
  return { ...splitTopLevel(obj), opaque: false };
}
