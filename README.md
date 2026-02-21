# bluebookify

[![npm](https://img.shields.io/npm/v/bluebookify)](https://www.npmjs.com/package/bluebookify)
[![license](https://img.shields.io/npm/l/bluebookify)](https://github.com/hangingahaw/bluebookify/blob/main/LICENSE)

Context-aware Bluebook citation formatting powered by LLMs.

Extracts citations from legal text — case citations, statutory references, short forms, and signals — and corrects their formatting to Bluebook standard. Only the citation contexts (not the full document) are sent to the LLM, making it token-efficient and privacy-conscious.

## Install

```sh
npm install bluebookify
```

## Quick start

```ts
import { bluebookify } from 'bluebookify'

const result = await bluebookify(
  'See Marbury v Madison, 5 US 137 (1803). The Court held that...',
  { apiKey: process.env.OPENAI_API_KEY, provider: 'openai' }
)

result.text
// → 'See *Marbury v. Madison*, 5 U.S. (1 Cranch) 137 (1803). The Court held that...'

result.corrections
// → [{ position: 4, original: 'Marbury v Madison, 5 US 137 (1803)', replacement: '*Marbury v. Madison*, 5 U.S. (1 Cranch) 137 (1803)', context: '...' }]

result.unchanged
// → false
```

## Providers

Built-in support for any OpenAI-compatible API, plus a native Anthropic adapter.

| Provider | Default model | Notes |
|---|---|---|
| `openai` | `gpt-4o-mini` | |
| `anthropic` | `claude-haiku-4-5-20251001` | Native adapter (different API format) |
| `gemini` | `gemini-2.0-flash` | OpenAI-compatible endpoint |
| `groq` | `llama-3.3-70b-versatile` | |
| `together` | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | |
| `mistral` | `mistral-small-latest` | |
| `xai` | `grok-3-mini-fast` | |
| `deepseek` | `deepseek-chat` | |
| `openrouter` | *(none — must specify `model`)* | |

Override the default model:

```ts
const result = await bluebookify(text, {
  apiKey: process.env.OPENAI_API_KEY,
  provider: 'openai',
  model: 'gpt-4o',
})
```

### Custom LLM function

Bypass the built-in client entirely:

```ts
const result = await bluebookify(text, {
  llm: async (messages) => {
    const res = await myLlmCall(messages)
    return res.text
  },
})
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | — | API key for the LLM provider |
| `provider` | `Provider` | — | Provider name (maps to base URL + default model) |
| `model` | `string` | *(per provider)* | Model name. Required if no provider default. |
| `baseURL` | `string` | — | Custom endpoint URL. Overrides provider mapping. |
| `llm` | `(messages) => Promise<string>` | — | Custom LLM function. Overrides apiKey/provider/model. |
| `rules` | `string` | `""` | Custom rules prepended to the system prompt |
| `contextSize` | `number` | `100` | Characters of context on each side of a citation |
| `batchSize` | `number` | `20` | Maximum citations per LLM call |

You must provide either `apiKey` (with `provider` or `model`) or `llm`.

## Result

```ts
interface BluebookifyResult {
  text: string          // The corrected text
  corrections: Array<{  // Only citations that were changed
    position: number    // Index in original text
    original: string    // What was there
    replacement: string // What it became
    context: string     // Surrounding snippet for audit
  }>
  unchanged: boolean    // true if nothing was modified
}
```

**No citations in text:** LLM is not called. Returns immediately with `unchanged: true`.

**All citations already correct:** LLM is called (correctness can't be pre-judged), but `corrections` is empty and `unchanged` is `true`.

## Custom rules

Pass domain-specific rules via the `rules` option. Works with [lexstyle](https://github.com/hangingahaw/lexstyle) for structured rule management:

```ts
import { rules, serialize } from 'lexstyle'
import { bluebookify } from 'bluebookify'

const result = await bluebookify(text, {
  apiKey: process.env.OPENAI_API_KEY,
  provider: 'openai',
  rules: serialize(rules, 'citations'),
})
```

Or pass rules as a plain string:

```ts
const result = await bluebookify(text, {
  apiKey: '...',
  provider: 'openai',
  rules: `Italicize case names. Use "U.S." not "US" for reporters.
Use Id. for immediately preceding authority. Use en dashes for page spans.`,
})
```

## Design decisions

**Extract-and-send.** Citations are discrete, identifiable chunks. Regex extracts them with surrounding context, and only those snippets are sent to the LLM. A 10,000-word brief with 15 citations sends ~15 small context windows, not 10,000 words.

**Wide context windows.** Default context size is 100 characters (vs 50 for dashes) because citations are longer and the LLM needs to see signals, parentheticals, and preceding/following citations to determine short-form vs full-cite relationships.

**Signal inclusion.** Introductory signals (See, Cf., But see, etc.) immediately before a citation are merged into the extraction, so the LLM can format them as a unit.

**Batch validation.** Each batch response is validated against its expected IDs before merging. Missing or unknown correction IDs are caught immediately.

**Robust response parsing.** LLM output is parsed via strict JSON first, with a hardened bracket-extraction fallback that skips stray brackets in preamble text.

## Development

```sh
npm install
npm test
npm run typecheck
npm run build     # ESM + CJS + .d.ts
```

## License

Apache-2.0
