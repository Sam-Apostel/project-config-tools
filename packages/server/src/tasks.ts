import { spawn, type ChildProcess } from 'node:child_process';
import type { PackageManager } from '@visual-config/core';

export interface TaskEvents {
  onOutput(taskId: string, chunk: string): void;
  onExit(taskId: string, code: number): void;
}

/** Spawns and tracks `<pm> run <script>` processes, streaming their output. */
export class TaskManager {
  private tasks = new Map<string, ChildProcess>();
  private seq = 0;

  constructor(
    private readonly root: string,
    private readonly getPackageManager: () => PackageManager,
    private readonly events: TaskEvents,
  ) {}

  run(script: string): string {
    const taskId = `task_${++this.seq}`;
    const pm = this.getPackageManager();
    const child = spawn(pm, ['run', script], {
      cwd: this.root,
      shell: false,
      env: { ...process.env, FORCE_COLOR: '1' },
    });
    this.tasks.set(taskId, child);

    child.stdout?.on('data', (d: Buffer) => this.events.onOutput(taskId, d.toString()));
    child.stderr?.on('data', (d: Buffer) => this.events.onOutput(taskId, d.toString()));
    child.on('error', (err) => {
      this.events.onOutput(taskId, `Failed to start "${pm} run ${script}": ${err.message}\n`);
      this.events.onExit(taskId, 1);
      this.tasks.delete(taskId);
    });
    child.on('close', (code) => {
      this.events.onExit(taskId, code ?? 0);
      this.tasks.delete(taskId);
    });

    return taskId;
  }

  stop(taskId: string): void {
    this.tasks.get(taskId)?.kill('SIGTERM');
  }

  stopAll(): void {
    for (const child of this.tasks.values()) child.kill('SIGTERM');
    this.tasks.clear();
  }
}
