import { modify, applyEdits, type JSONPath } from 'jsonc-parser';
import type { JsonValue } from '../types.js';
import { detectFormatting } from './format.js';

/**
 * Set a property (creating intermediate objects as needed) with a minimal,
 * format-preserving edit. Key order, unrelated whitespace, and — in JSONC —
 * comments are untouched. Returns the new document text.
 */
export function setJsonProperty(text: string, path: JSONPath, value: JsonValue): string {
  const formattingOptions = detectFormatting(text);
  const edits = modify(text, path, value, { formattingOptions });
  return applyEdits(text, edits);
}

/** Remove a property with a minimal, format-preserving edit. */
export function removeJsonProperty(text: string, path: JSONPath): string {
  const formattingOptions = detectFormatting(text);
  const edits = modify(text, path, undefined, { formattingOptions });
  return applyEdits(text, edits);
}
