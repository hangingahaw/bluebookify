import type { LlmOptions, Message } from "@lexstyle/llm-client";

// Re-export LLM types so existing consumers don't break
export type { Message, Provider } from "@lexstyle/llm-client";

/** A citation occurrence extracted from the input text */
export interface CitationContext {
  /** Unique identifier for this citation occurrence */
  id: number;
  /** The original citation text found */
  original: string;
  /** Text before the citation for context */
  before: string;
  /** Text after the citation for context */
  after: string;
  /** Start index in the original text */
  start: number;
  /** End index in the original text (exclusive) */
  end: number;
}

/** LLM's correction for a single citation */
export interface CitationCorrection {
  id: number;
  citation: string;
}

/** A single correction applied to the text, for audit/review */
export interface Correction {
  /** Position in original text */
  position: number;
  /** The original citation string */
  original: string;
  /** The replacement citation string */
  replacement: string;
  /** Surrounding context snippet */
  context: string;
}

/** Result of applying corrections to text */
export interface ApplyResult {
  text: string;
  appliedCorrections: Correction[];
}

/** Result returned by bluebookify */
export interface BluebookifyResult {
  /** The corrected text */
  text: string;
  /** List of corrections that were applied */
  corrections: Correction[];
  /** True if no changes were needed */
  unchanged: boolean;
}

/** Options for bluebookify */
export interface BluebookifyOptions extends LlmOptions {
  /** Characters of context on each side of a citation (default: 100) */
  contextSize?: number;
  /** Custom rules to prepend to the system prompt */
  rules?: string;
  /** Maximum citations per LLM call (default: 20). Must be >= 1. */
  batchSize?: number;
}
