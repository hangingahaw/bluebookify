import type { CitationContext } from "./types.js";

/**
 * Regex matching legal citation patterns (high recall, false positives OK).
 *
 * Targets:
 * - Full case citations: Name v. Name, Volume Reporter Page (Court Year)
 * - Statutory: Title U.S.C. § Number, Title C.F.R. § Number
 * - Short forms with "at": Volume Reporter at Page; Id. at Page
 * - Id. (standalone short form)
 * - Citation signals: See, Cf., See also, Accord, But see, Compare, E.g.,
 *
 * Order matters: longer/more-specific patterns first to prevent partial matches.
 */

// Case citations: "Name v. Name, 123 Reporter 456" with optional pincite and parenthetical
const CASE_RE =
  /[A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+)*\s+v\.\s+[A-Z][A-Za-z'.]+(?:\s+[A-Z][A-Za-z'.]+)*,?\s+\d+\s+(?:U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.(?:\s*2d)?|F\.(?:2d|3d|4th)|F\.\s*Supp\.(?:\s*(?:2d|3d))?|F\.\s*App'x)\s+\d+(?:,\s*\d+)?(?:\s*\([^)]*\d{4}\))?/g;

// Statutory citations: "42 U.S.C. § 1983" or "29 C.F.R. § 1926.1053"
const STATUTE_RE =
  /\d+\s+(?:U\.S\.C\.|C\.F\.R\.)\s*§+\s*[\d]+(?:\.\d+)?(?:\([a-zA-Z0-9]+\))*(?:(?:\u2013|-)[\d]+(?:\.\d+)?)?/g;

// Short form with reporter: "Smith, 123 F.3d at 456"
const SHORT_FORM_RE =
  /[A-Z][A-Za-z'.]+,\s+\d+\s+(?:U\.S\.|S\.\s*Ct\.|L\.\s*Ed\.(?:\s*2d)?|F\.(?:2d|3d|4th)|F\.\s*Supp\.(?:\s*(?:2d|3d))?|F\.\s*App'x)\s+at\s+\d+/g;

// Id. citations: "Id." or "Id. at 123"
const ID_RE = /\bId\.(?:\s+at\s+\d+(?:[,\u2013-]\s*\d+)?)?/g;

// Signals before citations
const SIGNAL_RE =
  /\b(?:See\s+also|But\s+see|But\s+cf\.|See,?\s+e\.g\.,|See|Cf\.|Accord,?|Compare|E\.g\.,)\s/g;

interface PatternMatch {
  text: string;
  start: number;
  end: number;
}

/**
 * Extract all legal citations from text with surrounding context.
 *
 * Returns a CitationContext for every citation occurrence, giving the LLM
 * enough surrounding text to determine the correct Bluebook formatting.
 */
export function extractCitations(
  text: string,
  contextSize = 100
): CitationContext[] {
  // Collect all matches from all patterns
  const allMatches: PatternMatch[] = [];

  const patterns = [CASE_RE, STATUTE_RE, SHORT_FORM_RE, ID_RE];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      allMatches.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Check for signals that prefix citations and extend matches
  SIGNAL_RE.lastIndex = 0;
  let signalMatch: RegExpExecArray | null;
  const signals: PatternMatch[] = [];
  while ((signalMatch = SIGNAL_RE.exec(text)) !== null) {
    signals.push({
      text: signalMatch[0],
      start: signalMatch.index,
      end: signalMatch.index + signalMatch[0].length,
    });
  }

  // Merge overlapping matches: sort by start, then merge
  allMatches.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: PatternMatch[] = [];
  for (const m of allMatches) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) {
      // Overlapping or adjacent: extend
      if (m.end > last.end) {
        last.end = m.end;
        last.text = text.slice(last.start, last.end);
      }
    } else {
      merged.push({ ...m });
    }
  }

  // Extend citations backward to include any signal that immediately precedes them
  for (const citation of merged) {
    for (const signal of signals) {
      if (signal.end === citation.start || signal.end === citation.start - 1) {
        citation.start = signal.start;
        citation.text = text.slice(citation.start, citation.end);
      }
    }
  }

  // Build CitationContext objects
  const results: CitationContext[] = [];
  let id = 0;

  for (const m of merged) {
    const start = m.start;
    const end = m.end;

    // Grab character window before the citation
    const bStart = Math.max(0, start - contextSize);
    let before = text.slice(bStart, start);
    // Trim to word boundary if we sliced mid-word
    if (bStart > 0) {
      const idx = before.search(/\s/);
      if (idx !== -1) {
        before = before.slice(idx).trimStart();
      }
    }

    // Grab character window after the citation
    const aEnd = Math.min(text.length, end + contextSize);
    let after = text.slice(end, aEnd);
    // Trim to word boundary if we sliced mid-word
    if (aEnd < text.length) {
      const idx = after.search(/\s[^\s]*$/);
      if (idx > 0) {
        after = after.slice(0, idx);
      }
    }

    results.push({ id: id++, original: m.text, before, after, start, end });
  }

  return results;
}
