import type { Message } from "@lexstyle/llm-client";
import type { CitationContext } from "./types.js";

/**
 * Build the messages array for a single LLM call.
 *
 * System prompt contains Bluebook citation rules (sent once).
 * User prompt contains only the extracted citation contexts (compact).
 */
export function buildMessages(
  contexts: readonly CitationContext[],
  rules?: string
): Message[] {
  const ruleBlock = rules
    ? `\n${rules}\n`
    : "";

  const system = `You are a legal citation expert specializing in Bluebook format (The Bluebook: A Uniform System of Citation).
${ruleBlock}
Your task is to correct each citation below to proper Bluebook format.

Key Bluebook rules to apply:
- Case names italicized (use *asterisks* for italic markers)
- Proper reporter abbreviations with correct spacing (e.g., "F.3d" not "F. 3d")
- Correct use of "v." (not "vs." or "vs")
- Proper pincite format with comma separators
- Proper short-form citations (Id. rules)
- Correct section symbols and spacing for statutes
- Proper parenthetical format for court and year

IMPORTANT: You must return exactly one entry for every id provided. Do not skip any.
If a citation is already correctly formatted, return it unchanged.
Respond with ONLY a JSON array. No explanation, no markdown fences.
Format: [{"id":0,"citation":"*Marbury v. Madison*, 5 U.S. (1 Cranch) 137 (1803)"}]`;

  const user = contexts
    .map((ctx) => `[${ctx.id}] \u201C${ctx.before}\u201D [${ctx.original}] \u201C${ctx.after}\u201D`)
    .join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
