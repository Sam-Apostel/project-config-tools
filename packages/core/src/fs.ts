import { readFile, writeFile, rm, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { FileSystem } from './types.js';

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

  /** Test helper: snapshot the current contents. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.files);
  }
}
