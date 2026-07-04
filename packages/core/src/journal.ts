import type { FileEdit } from './types.js';

export type Actor = 'user' | 'agent' | 'plugin';

export interface JournalEntry {
  id: string;
  changeId: string;
  operationId: string;
  actor: Actor;
  /** Epoch ms, stamped by the engine at apply time. */
  appliedAt: number;
  summary: string;
  /** The forward edits; undo applies their inverse. */
  edits: FileEdit[];
  ranCommands: string[];
  undone: boolean;
}

/**
 * The audit + undo log. In-memory for now; persistence to a gitignored
 * `.visual-config/journal` is a later concern (see spec 01 §4).
 */
export class Journal {
  private entries: JournalEntry[] = [];

  add(entry: JournalEntry): void {
    this.entries.push(entry);
  }

  get(id: string): JournalEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Most-recent first. */
  list(): JournalEntry[] {
    return [...this.entries].reverse();
  }

  /** Chronological order (for persistence). */
  all(): JournalEntry[] {
    return [...this.entries];
  }

  /** Replace entries (e.g. after loading from disk). */
  load(entries: JournalEntry[]): void {
    this.entries = [...entries];
  }

  markUndone(id: string): void {
    const entry = this.get(id);
    if (entry) entry.undone = true;
  }
}
