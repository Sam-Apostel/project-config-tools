import type {
  BumpAnalysis,
  BumpFinding,
  ChangelogSource,
  ReleaseNotes,
  UsageMap,
} from './types.js';

export interface AnalyzeBumpArgs {
  pkg: string;
  from: string;
  to: string;
  repoUrl?: string;
  changelog: ChangelogSource;
  usage: UsageMap;
}

/**
 * Decide whether a bump is safe **for this codebase**: fetch the changelog,
 * extract breaking changes, and cross-reference each against the app's actual
 * usage. Deterministic — an LLM assist for prose-only items is a later, opt-in
 * layer (spec 04 §4). Conservative by default.
 */
export async function analyzeBump(args: AnalyzeBumpArgs): Promise<BumpAnalysis> {
  const { pkg, from, to, repoUrl, changelog, usage } = args;
  const notes: string[] = [];

  let releases: ReleaseNotes[] = [];
  try {
    releases = await changelog.fetch(pkg, from, to, repoUrl);
  } catch (err) {
    notes.push(`Could not fetch changelog: ${(err as Error).message}`);
  }

  const breaking = releases.flatMap((r) => r.breakingChanges);
  const usesEverything = usage.symbols.includes('*');
  const usedSymbols = new Set(usage.symbols);
  const reasons: BumpFinding[] = [];
  const unknowns: string[] = [];

  for (const bc of breaking) {
    if (!bc.symbols || bc.symbols.length === 0) {
      unknowns.push(bc.summary);
      reasons.push({
        breaking: bc,
        assessment: usage.used ? 'used-safely' : 'not-used',
        hits: [],
        note: 'Could not map this change to specific code — review manually.',
      });
      continue;
    }

    const hitSymbols = bc.symbols.filter((s) => usesEverything || usedSymbols.has(s));
    if (hitSymbols.length === 0) {
      reasons.push({
        breaking: bc,
        assessment: 'not-used',
        hits: [],
        note: `Your code doesn't import ${bc.symbols.join(', ')}.`,
      });
    } else {
      const hits = usage.sites.filter(
        (site) => usesEverything || site.imported.some((i) => hitSymbols.includes(i)),
      );
      reasons.push({
        breaking: bc,
        assessment: 'used-affected',
        hits,
        note: `Your code uses ${hitSymbols.join(', ')}.`,
      });
    }
  }

  const anyAffected = reasons.some((r) => r.assessment === 'used-affected');
  let verdict: BumpAnalysis['verdict'];
  if (anyAffected) {
    verdict = 'breaking';
  } else if (releases.length === 0) {
    verdict = 'review';
    if (!notes.length) notes.push('No changelog found — review this bump manually.');
  } else if (unknowns.length > 0 && usage.used) {
    verdict = 'review';
  } else {
    verdict = 'safe';
    if (breaking.length === 0) notes.push('No breaking changes detected in the changelog.');
  }

  return { package: pkg, from, to, verdict, reasons, usage, unknowns, notes };
}
