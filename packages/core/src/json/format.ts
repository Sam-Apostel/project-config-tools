import type { FormattingOptions } from 'jsonc-parser';

/**
 * Detect the indentation and line ending of an existing JSON document so edits
 * match the file's own style. This is what keeps diffs minimal.
 */
export function detectFormatting(text: string): FormattingOptions {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';

  // First line that begins with indentation followed by a non-space char.
  const match = text.match(/\n([ \t]+)\S/);
  const indent = match?.[1];
  if (indent) {
    if (indent.includes('\t')) {
      return { insertSpaces: false, tabSize: 1, eol };
    }
    return { insertSpaces: true, tabSize: indent.length, eol };
  }

  return { insertSpaces: true, tabSize: 2, eol };
}
