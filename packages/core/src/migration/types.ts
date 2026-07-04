/** Types for changelog ingestion and code-aware bump-safety analysis (spec 04). */

export interface BreakingChange {
  version: string;
  summary: string;
  kind:
    | 'removed-api'
    | 'changed-signature'
    | 'renamed'
    | 'behavior'
    | 'config'
    | 'peer-dep'
    | 'node-engine'
    | 'esm-cjs'
    | 'unknown';
  /** API symbols the change touches, when extractable (e.g. ['createStore']). */
  symbols?: string[];
  docUrl?: string;
}

export interface ReleaseNotes {
  version: string;
  url?: string;
  body: string;
  breakingChanges: BreakingChange[];
}

/** Resolve release notes between two versions of a package (injectable). */
export interface ChangelogSource {
  fetch(pkg: string, from: string, to: string, repoUrl?: string): Promise<ReleaseNotes[]>;
}

/** Where in the app a package's API is used. */
export interface UsageSite {
  file: string;
  line: number;
  /** Imported identifiers on this line (named/default/namespace). */
  imported: string[];
  kind: 'import' | 'require' | 'subpath-import';
}

export interface UsageMap {
  package: string;
  used: boolean;
  /** Every distinct imported symbol across the app. */
  symbols: string[];
  sites: UsageSite[];
}

export type BumpAssessment = 'not-used' | 'used-safely' | 'used-affected';

export interface BumpFinding {
  breaking: BreakingChange;
  assessment: BumpAssessment;
  hits: UsageSite[];
  note: string;
}

export interface BumpAnalysis {
  package: string;
  from: string;
  to: string;
  verdict: 'safe' | 'review' | 'breaking';
  reasons: BumpFinding[];
  usage: UsageMap;
  /** Changelog items we could not map to code (require manual review). */
  unknowns: string[];
  notes: string[];
}
