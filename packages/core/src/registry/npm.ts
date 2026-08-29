/** A search hit from the npm registry's search endpoint. */
export interface RegistrySearchHit {
  name: string;
  version: string;
  description?: string;
  date?: string;
  links?: { npm?: string; homepage?: string; repository?: string };
  publisher?: string;
  keywords?: string[];
}

/** A security advisory affecting one or more versions of a package. */
export interface Advisory {
  id?: number;
  title: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  url?: string;
  /** semver range of affected versions, e.g. "<4.17.21". */
  vulnerable_versions?: string;
}

/** The registry surface the engine depends on (injectable for tests/offline). */
export interface Registry {
  search(query: string, size?: number): Promise<RegistrySearchHit[]>;
  latestVersion(name: string): Promise<string | undefined>;
  /**
   * The deprecation message on the package's latest version, if any (npm sets a
   * `deprecated` string when a maintainer deprecates a package/version). Optional
   * so offline/stub registries need not implement it.
   */
  deprecation?(name: string): Promise<string | undefined>;
  /**
   * Security advisories for the given `{ name: [versions] }`, keyed by package.
   * Only advisories affecting the supplied versions are returned. Optional.
   */
  advisories?(query: Record<string, string[]>): Promise<Record<string, Advisory[]>>;
  /**
   * Unpacked size in bytes of a package version's own files (`dist.unpackedSize`
   * from the registry), or undefined if unknown. `version` defaults to `latest`.
   */
  unpackedSize?(name: string, version?: string): Promise<number | undefined>;
  /** Every published version of a package, in registry order. Optional. */
  versions?(name: string): Promise<string[]>;
}

interface RawSearchResponse {
  objects?: Array<{
    package?: {
      name?: string;
      version?: string;
      description?: string;
      date?: string;
      links?: Record<string, string>;
      publisher?: { username?: string };
      keywords?: string[];
    };
  }>;
}

/** The real npm registry, over HTTPS. */
export class NpmRegistry implements Registry {
  constructor(
    private readonly baseUrl = 'https://registry.npmjs.org',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(query: string, size = 20): Promise<RegistrySearchHit[]> {
    const url = `${this.baseUrl}/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`Registry search failed: ${res.status}`);
    const data = (await res.json()) as RawSearchResponse;
    return (data.objects ?? []).flatMap((obj) => {
      const p = obj.package;
      if (!p?.name || !p.version) return [];
      return [
        {
          name: p.name,
          version: p.version,
          description: p.description,
          date: p.date,
          links: p.links,
          publisher: p.publisher?.username,
          keywords: p.keywords,
        },
      ];
    });
  }

  async latestVersion(name: string): Promise<string | undefined> {
    return (await this.latestManifest(name))?.version;
  }

  async deprecation(name: string): Promise<string | undefined> {
    const deprecated = (await this.latestManifest(name))?.deprecated;
    // npm stores a boolean `true` on some legacy deprecations; normalize to text.
    if (deprecated === true) return 'This package is deprecated.';
    return typeof deprecated === 'string' && deprecated.trim() ? deprecated : undefined;
  }

  async advisories(query: Record<string, string[]>): Promise<Record<string, Advisory[]>> {
    if (Object.keys(query).length === 0) return {};
    const res = await this.fetchImpl(`${this.baseUrl}/-/npm/v1/security/advisories/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!res.ok) throw new Error(`Advisory lookup failed: ${res.status}`);
    return (await res.json()) as Record<string, Advisory[]>;
  }

  async unpackedSize(name: string, version = 'latest'): Promise<number | undefined> {
    const manifest = await this.manifest(name, version);
    const size = manifest?.dist?.unpackedSize;
    return typeof size === 'number' && size >= 0 ? size : undefined;
  }

  async versions(name: string): Promise<string[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/${name}`);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Registry lookup failed for ${name}: ${res.status}`);
    const doc = (await res.json()) as { versions?: Record<string, unknown> };
    return Object.keys(doc.versions ?? {});
  }

  private async latestManifest(
    name: string,
  ): Promise<{ version?: string; deprecated?: string | boolean } | undefined> {
    return this.manifest(name, 'latest');
  }

  private async manifest(
    name: string,
    version: string,
  ): Promise<
    | { version?: string; deprecated?: string | boolean; dist?: { unpackedSize?: number } }
    | undefined
  > {
    const res = await this.fetchImpl(`${this.baseUrl}/${name}/${version}`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Registry lookup failed for ${name}: ${res.status}`);
    return (await res.json()) as {
      version?: string;
      deprecated?: string | boolean;
      dist?: { unpackedSize?: number };
    };
  }
}
