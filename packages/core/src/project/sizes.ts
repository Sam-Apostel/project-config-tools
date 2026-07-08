import type { DependencyType, ProjectModel } from '../types.js';
import type { Registry } from '../registry/npm.js';

export interface PackageSize {
  name: string;
  version: string;
  type: DependencyType;
  /** Unpacked size of the package's own files, in bytes. */
  bytes: number;
}

export interface InstallSizes {
  generatedAt: number;
  /** Sum of every measured package's own unpacked size, in bytes. */
  total: number;
  /** How many deps we couldn't get a size for (private, unpublished, offline). */
  unknown: number;
  /** Measured packages, largest first. */
  packages: PackageSize[];
}

const NON_REGISTRY = /^(workspace:|file:|link:|git\+|https?:|npm:|catalog:|\*$)/;

/**
 * How much each direct dependency contributes to install size, using the
 * registry's `dist.unpackedSize` for the installed (or latest) version. This is
 * each package's OWN unpacked footprint — an honest, comparable per-package
 * number, not a transitive rollup (shared deps make true attribution ambiguous).
 * Per-dep failures are swallowed and counted in `unknown`.
 */
export async function computeInstallSizes(
  project: ProjectModel,
  registry: Registry,
): Promise<InstallSizes> {
  if (!registry.unpackedSize) {
    return { generatedAt: Date.now(), total: 0, unknown: 0, packages: [] };
  }
  const deps = project.dependencies.filter(
    (d) => (d.type === 'prod' || d.type === 'dev') && !NON_REGISTRY.test(d.range),
  );

  let unknown = 0;
  const measured = await Promise.all(
    deps.map(async (dep): Promise<PackageSize | null> => {
      try {
        const version = dep.resolved ?? 'latest';
        const bytes = await registry.unpackedSize!(dep.name, version);
        if (bytes === undefined) return null;
        return { name: dep.name, version: dep.resolved ?? 'latest', type: dep.type, bytes };
      } catch {
        return null;
      }
    }),
  );

  const packages = measured.filter((p): p is PackageSize => p !== null);
  unknown = deps.length - packages.length;
  packages.sort((a, b) => b.bytes - a.bytes);
  const total = packages.reduce((sum, p) => sum + p.bytes, 0);
  return { generatedAt: Date.now(), total, unknown, packages };
}
