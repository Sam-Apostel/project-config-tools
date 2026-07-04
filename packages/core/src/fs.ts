import { readFile, writeFile, rm, mkdir, access, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { FileSystem } from './types.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.visual-config']);

/** Real filesystem, operating on absolute paths. */
export class NodeFileSystem implements FileSystem {
  async readFile(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }

  async deleteFile(path: string): Promise<void> {
    await rm(path, { force: true });
  }

  async walk(dir: string): Promise<string[]> {
    const out: string[] = [];
    const visit = async (current: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          await visit(join(current, entry.name));
        } else if (entry.isFile()) {
          out.push(join(current, entry.name));
        }
      }
    };
    await visit(dir);
    return out;
  }
}

/** In-memory filesystem for tests. Keys are absolute paths. */
export class InMemoryFileSystem implements FileSystem {
  private files: Map<string, string>;

  constructor(initial: Record<string, string> = {}) {
    this.files = new Map(Object.entries(initial));
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`ENOENT: ${path}`);
    return content;
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async walk(dir: string): Promise<string[]> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return [...this.files.keys()].filter(
      (p) =>
        p.startsWith(prefix) &&
        !p
          .slice(prefix.length)
          .split('/')
          .some((s) => SKIP_DIRS.has(s)),
    );
  }

  /** Test helper: snapshot the current contents. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files);
  }
}
