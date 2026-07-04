import type { Operation, OperationInfo } from '../types.js';

/** Holds every registered operation. Built-in and plugin operations live here alike. */
export class OperationRegistry {
  private ops = new Map<string, Operation<unknown>>();

  register<I>(op: Operation<I>): void {
    if (this.ops.has(op.id)) {
      throw new Error(`Operation "${op.id}" is already registered`);
    }
    this.ops.set(op.id, op as Operation<unknown>);
  }

  get(id: string): Operation<unknown> | undefined {
    return this.ops.get(id);
  }

  has(id: string): boolean {
    return this.ops.has(id);
  }

  list(): OperationInfo[] {
    return [...this.ops.values()].map((op) => ({
      id: op.id,
      title: op.title,
      summary: op.summary,
      inputSchema: op.inputSchema,
      risk: op.risk,
    }));
  }
}
