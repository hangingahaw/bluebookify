import type { ApplyResult, CitationContext, CitationCorrection, Correction } from "./types.js";

/**
 * Parse the LLM response into an array of CitationCorrection objects.
 *
 * Parsing strategy (in order):
 * 1. Strict JSON.parse on the full cleaned response
 * 2. Bracket extraction: try each `[` position left-to-right paired with
 *    the last `]`, stop at first valid JSON array parse
 *
 * Validates that each correction contains a non-empty citation string.
 */
export function parseResponse(response: string): CitationCorrection[] {
  // Strip markdown code fences if present
  let cleaned = response.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  cleaned = cleaned.trim();

  // Try strict JSON.parse first (handles clean responses)
  let parsed: unknown;
  try {
    const strict = JSON.parse(cleaned);
    if (Array.isArray(strict)) {
      parsed = strict;
    }
  } catch {
    // Not valid JSON — fall through to bracket extraction
  }

  // Fallback: try each [ position from left, paired with last ]
  if (parsed === undefined) {
    const end = cleaned.lastIndexOf("]");
    if (end === -1) {
      throw new Error(`Invalid LLM response: no JSON array found. Response: ${cleaned.slice(0, 200)}`);
    }

    for (let i = 0; i < end; i++) {
      if (cleaned[i] !== "[") continue;
      try {
        const candidate = JSON.parse(cleaned.slice(i, end + 1));
        if (Array.isArray(candidate)) {
          parsed = candidate;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      parsed === undefined
        ? `Invalid LLM response: no JSON array found. Response: ${cleaned.slice(0, 200)}`
        : "LLM response is not a JSON array"
    );
  }

  // Validate and extract each item
  const seenIds = new Set<number>();
  return parsed.map((item: unknown, idx: number) => {
    const rec = item as Record<string, unknown> | null;
    if (typeof rec !== "object" || rec === null || typeof rec.id !== "number" || typeof rec.citation !== "string") {
      throw new Error(`Invalid correction at index ${idx}: ${JSON.stringify(item)}`);
    }

    const correction: CitationCorrection = { id: rec.id as number, citation: rec.citation as string };

    // Validate citation is non-empty
    if (correction.citation.trim().length === 0) {
      throw new Error(
        `Empty citation at index ${idx} (id ${correction.id}): citation must be a non-empty string`
      );
    }

    // Check for duplicate IDs
    if (seenIds.has(correction.id)) {
      throw new Error(`Duplicate correction id ${correction.id} at index ${idx}`);
    }
    seenIds.add(correction.id);

    return correction;
  });
}

/**
 * Apply corrections to the original text.
 *
 * Validates that every extracted citation has exactly one correction.
 * Only applies corrections where the replacement differs from the original.
 * Processes positions from end to start to preserve index integrity.
 */
export function applyCorrections(
  text: string,
  contexts: readonly CitationContext[],
  corrections: readonly CitationCorrection[]
): ApplyResult {
  // Map corrections by id for lookup
  const correctionMap = new Map<number, string>();
  for (const c of corrections) {
    correctionMap.set(c.id, c.citation);
  }

  // Validate: every context must have a correction
  const contextIds = new Set(contexts.map((c) => c.id));
  for (const id of contextIds) {
    if (!correctionMap.has(id)) {
      throw new Error(`Missing correction for citation id ${id}`);
    }
  }

  // Validate: no unknown correction IDs
  for (const id of correctionMap.keys()) {
    if (!contextIds.has(id)) {
      throw new Error(`Unknown correction id ${id}: no matching citation context`);
    }
  }

  // Build list of actual changes (where replacement differs from original)
  const changes: { context: CitationContext; replacement: string }[] = [];
  for (const ctx of contexts) {
    const replacement = correctionMap.get(ctx.id)!;
    if (replacement !== ctx.original) {
      changes.push({ context: ctx, replacement });
    }
  }

  // Sort by position descending so replacements don't shift indices
  changes.sort((a, b) => b.context.start - a.context.start);

  let result = text;
  const appliedCorrections: Correction[] = [];

  for (const { context: ctx, replacement } of changes) {
    // Build a context snippet for audit
    // Legal citations are longer than single dashes — use wider context snippets
    const snippetBefore = ctx.before.slice(-30);
    const snippetAfter = ctx.after.slice(0, 30);
    const contextSnippet = `${snippetBefore}[${ctx.original}\u2192${replacement}]${snippetAfter}`;

    result = result.slice(0, ctx.start) + replacement + result.slice(ctx.end);

    appliedCorrections.push({
      position: ctx.start,
      original: ctx.original,
      replacement,
      context: contextSnippet,
    });
  }

  // Return corrections in forward order (by position ascending)
  appliedCorrections.reverse();

  return { text: result, appliedCorrections };
}
