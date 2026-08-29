import { describe, it, expect } from 'vitest';
import { Fleet } from './fleet.js';
import { Engine } from '../engine.js';
import { InMemoryFileSystem } from '../fs.js';
import { createDefaultRegistry } from '../index.js';
import type { CommandRunner, RunResult } from '../runner.js';

class StubRunner implements CommandRunner {
  calls: string[][] = [];
  run(argv: string[]): Promise<RunResult> {
    this.calls.push(argv);
    return Promise.resolve({ code: 0, output: '' });
  }
}

function pkg(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

/** Build a Fleet over two repos sharing one in-memory fs; r1 has lodash, r2 doesn't. */
async function makeFleet(): Promise<{ fleet: Fleet; fs: InMemoryFileSystem }> {
  const fs = new InMemoryFileSystem({
    '/r1/package.json': pkg({ name: 'r1', dependencies: { lodash: '^4.17.21' } }),
    '/r2/package.json': pkg({ name: 'r2', dependencies: { zod: '^3' } }),
  });
  const engines = new Map<string, Engine>();
  for (const root of ['/r1', '/r2']) {
    engines.set(
      root,
      await Engine.create({
        root,
        fs,
        registry: createDefaultRegistry(),
        runner: new StubRunner(),
      }),
    );
  }
  const fleet = new Fleet(
    [
      { root: '/r1', name: 'r1' },
      { root: '/r2', name: 'r2' },
    ],
    (root) => Promise.resolve(engines.get(root)!),
  );
  return { fleet, fs };
}

describe('Fleet', () => {
  it('plans across repos, skipping ones where the operation does not apply', async () => {
    const { fleet } = await makeFleet();
    const plan = await fleet.planAcross('remove-dependency', { name: 'lodash' });
    expect(plan.planned).toBe(1);
    expect(plan.skipped).toBe(1);

    const planned = plan.entries.find((e) => e.status === 'planned')!;
    expect(planned.root).toBe('/r1');
    expect(planned.change).toBeDefined();

    const skipped = plan.entries.find((e) => e.status === 'skipped')!;
    expect(skipped.root).toBe('/r2');
    expect(skipped.reason).toBeTruthy(); // the operation's own "not present" message
  });

  it('applies only the planned repos, leaving skipped ones untouched', async () => {
    const { fleet, fs } = await makeFleet();
    const plan = await fleet.planAcross('remove-dependency', { name: 'lodash' });
    const result = await fleet.applyAcross(plan);

    expect(result.applied).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.entries).toEqual([{ root: '/r1', name: 'r1', ok: true, errors: [] }]);

    expect(JSON.parse(await fs.readFile('/r1/package.json')).dependencies.lodash).toBeUndefined();
    expect(JSON.parse(await fs.readFile('/r2/package.json')).dependencies.zod).toBe('^3'); // untouched
  });

  it('skips every repo for an unknown operation instead of throwing', async () => {
    const { fleet } = await makeFleet();
    const plan = await fleet.planAcross('does-not-exist', {});
    expect(plan.planned).toBe(0);
    expect(plan.skipped).toBe(2);
  });
});
