import { createTwoFilesPatch } from 'diff';

/**
 * Produce a unified diff for a file edit, for display in the Diff Sheet.
 * `before`/`after` may be null (file created / deleted).
 */
export function makeUnifiedDiff(path: string, before: string | null, after: string | null): string {
  const a = before ?? '';
  const b = after ?? '';
  if (a === b) return '';
  return createTwoFilesPatch(path, path, a, b, '', '', { context: 3 });
}
