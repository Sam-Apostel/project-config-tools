import type { Registry, RegistrySearchHit } from './registry/npm.js';

export interface CatalogQuery {
  text: string;
  size?: number;
}

export interface CatalogPackage {
  name: string;
  version: string;
  description?: string;
  date?: string;
  npm?: string;
  homepage?: string;
  repository?: string;
  publisher?: string;
  keywords?: string[];
}

export interface CatalogResult {
  query: string;
  packages: CatalogPackage[];
}

function toCatalogPackage(hit: RegistrySearchHit): CatalogPackage {
  return {
    name: hit.name,
    version: hit.version,
    description: hit.description,
    date: hit.date,
    npm: hit.links?.npm,
    homepage: hit.links?.homepage,
    repository: hit.links?.repository,
    publisher: hit.publisher,
    keywords: hit.keywords,
  };
}

/** Search the registry and shape results for the catalog UI. */
export async function searchCatalog(
  registry: Registry,
  query: CatalogQuery,
): Promise<CatalogResult> {
  const hits = await registry.search(query.text, query.size ?? 20);
  return { query: query.text, packages: hits.map(toCatalogPackage) };
}
