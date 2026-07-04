import { spawn } from 'node:child_process';

export interface RunOptions {
  cwd: string;
  onOutput?: (chunk: string) => void;
  env?: Record<string, string>;
}

export interface RunResult {
  code: number;
  output: string;
}

export interface CommandRunner {
  run(argv: string[], opts: RunOptions): Promise<RunResult>;
}

/** Runs a command as argv (no shell), streaming output. */
export class NodeCommandRunner implements CommandRunner {
  run(argv: string[], opts: RunOptions): Promise<RunResult> {
    const [command, ...args] = argv;
    if (!command) return Promise.resolve({ code: 0, output: '' });
    return new Promise<RunResult>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        shell: false,
      });
      let output = '';
      const capture = (chunk: Buffer): void => {
        const text = chunk.toString();
        output += text;
        opts.onOutput?.(text);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.on('error', reject);
      child.on('close', (code) => resolve({ code: code ?? 0, output }));
    });
  }
}
