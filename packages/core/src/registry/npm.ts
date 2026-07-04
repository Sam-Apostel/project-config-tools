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

/** The registry surface the engine depends on (injectable for tests/offline). */
export interface Registry {
  search(query: string, size?: number): Promise<RegistrySearchHit[]>;
  latestVersion(name: string): Promise<string | undefined>;
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
    const res = await this.fetchImpl(`${this.baseUrl}/${name}/latest`);
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`Registry lookup failed for ${name}: ${res.status}`);
    const data = (await res.json()) as { version?: string };
    return data.version;
  }
}
