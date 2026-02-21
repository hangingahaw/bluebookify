import { describe, it, expect } from "vitest";
import { parseResponse, applyCorrections } from "../src/replacer.js";
import type { CitationContext } from "../src/types.js";

describe("parseResponse", () => {
  it("parses clean JSON array", () => {
    const result = parseResponse('[{"id":0,"citation":"*Marbury v. Madison*, 5 U.S. 137 (1803)"}]');
    expect(result).toEqual([
      { id: 0, citation: "*Marbury v. Madison*, 5 U.S. 137 (1803)" },
    ]);
  });

  it("parses fenced JSON", () => {
    const result = parseResponse('```json\n[{"id":0,"citation":"42 U.S.C. \\u00a7 1983"}]\n```');
    expect(result).toEqual([{ id: 0, citation: "42 U.S.C. \u00a7 1983" }]);
  });

  it("handles extra whitespace", () => {
    const result = parseResponse('  \n  [{"id":0,"citation":"Id. at 155"}]  \n  ');
    expect(result).toEqual([{ id: 0, citation: "Id. at 155" }]);
  });

  it("extracts JSON array from surrounding text", () => {
    const result = parseResponse('Here is the result: [{"id":0,"citation":"Id."}] Hope this helps!');
    expect(result).toEqual([{ id: 0, citation: "Id." }]);
  });

  it("skips non-array brackets before the actual JSON array", () => {
    const result = parseResponse(
      'Here is [my analysis] of the citations: [{"id":0,"citation":"Id. at 100"}]'
    );
    expect(result).toEqual([{ id: 0, citation: "Id. at 100" }]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseResponse("{not valid}")).toThrow("no JSON array found");
  });

  it("throws on non-array JSON", () => {
    expect(() => parseResponse('{"id":0}')).toThrow("no JSON array found");
  });

  it("throws on malformed array items (id not number)", () => {
    expect(() => parseResponse('[{"id":"zero","citation":"test"}]')).toThrow("Invalid correction");
  });

  it("throws on malformed array items (citation not string)", () => {
    expect(() => parseResponse('[{"id":0,"citation":123}]')).toThrow("Invalid correction");
  });

  it("throws on empty response", () => {
    expect(() => parseResponse("")).toThrow("no JSON array found");
  });

  it("rejects empty citation strings", () => {
    expect(() => parseResponse('[{"id":0,"citation":""}]')).toThrow("Empty citation");
  });

  it("rejects whitespace-only citation strings", () => {
    expect(() => parseResponse('[{"id":0,"citation":"   "}]')).toThrow("Empty citation");
  });

  it("rejects duplicate correction IDs", () => {
    expect(() =>
      parseResponse('[{"id":0,"citation":"test"},{"id":0,"citation":"test2"}]')
    ).toThrow("Duplicate correction id 0");
  });

  it("parses multiple corrections", () => {
    const result = parseResponse(
      '[{"id":0,"citation":"*Smith v. Jones*, 100 F.3d 200 (1st Cir. 1996)"},{"id":1,"citation":"42 U.S.C. \\u00a7 1983"}]'
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(0);
    expect(result[1].id).toBe(1);
  });
});

describe("applyCorrections", () => {
  const makeContext = (
    id: number,
    original: string,
    start: number,
    end: number,
    before = "",
    after = ""
  ): CitationContext => ({ id, original, before, after, start, end });

  it("applies a single correction", () => {
    const text = "held in Marbury v Madison, 5 US 137 (1803) that";
    const original = "Marbury v Madison, 5 US 137 (1803)";
    const start = text.indexOf(original);
    const end = start + original.length;
    const contexts = [makeContext(0, original, start, end, "held in", "that")];
    const corrections = [{ id: 0, citation: "*Marbury v. Madison*, 5 U.S. 137 (1803)" }];

    const result = applyCorrections(text, contexts, corrections);
    expect(result.text).toBe("held in *Marbury v. Madison*, 5 U.S. 137 (1803) that");
    expect(result.appliedCorrections).toHaveLength(1);
    expect(result.appliedCorrections[0].original).toBe(original);
    expect(result.appliedCorrections[0].replacement).toBe("*Marbury v. Madison*, 5 U.S. 137 (1803)");
  });

  it("applies multiple corrections preserving positions", () => {
    const text = "AAA first BBB second CCC";
    const contexts = [
      makeContext(0, "AAA", 0, 3, "", "first"),
      makeContext(1, "BBB", 10, 13, "first", "second"),
      makeContext(2, "CCC", 21, 24, "second", ""),
    ];
    const corrections = [
      { id: 0, citation: "aaa" },
      { id: 1, citation: "bbb" },
      { id: 2, citation: "ccc" },
    ];

    const result = applyCorrections(text, contexts, corrections);
    expect(result.text).toBe("aaa first bbb second ccc");
    expect(result.appliedCorrections).toHaveLength(3);
    // Should be in forward order
    expect(result.appliedCorrections[0].position).toBe(0);
    expect(result.appliedCorrections[1].position).toBe(10);
    expect(result.appliedCorrections[2].position).toBe(21);
  });

  it("skips corrections where replacement equals original", () => {
    const text = "42 U.S.C. \u00a7 1983 applies";
    const original = "42 U.S.C. \u00a7 1983";
    const start = 0;
    const end = original.length;
    const contexts = [makeContext(0, original, start, end, "", "applies")];
    const corrections = [{ id: 0, citation: original }];

    const result = applyCorrections(text, contexts, corrections);
    expect(result.text).toBe(text);
    expect(result.appliedCorrections).toHaveLength(0);
  });

  it("includes context snippet in corrections", () => {
    const text = "held in Marbury v Madison, 5 US 137 that";
    const original = "Marbury v Madison, 5 US 137";
    const start = text.indexOf(original);
    const end = start + original.length;
    const contexts = [makeContext(0, original, start, end, "held in", "that")];
    const corrections = [{ id: 0, citation: "*Marbury v. Madison*, 5 U.S. 137" }];

    const result = applyCorrections(text, contexts, corrections);
    expect(result.appliedCorrections[0].context).toContain("\u2192");
    expect(result.appliedCorrections[0].context).toContain(original);
  });

  it("handles replacement with different length than original", () => {
    const text = "AAA then BBB end";
    const contexts = [
      makeContext(0, "AAA", 0, 3, "", "then"),
      makeContext(1, "BBB", 9, 12, "then", "end"),
    ];
    const corrections = [
      { id: 0, citation: "AAAAAAA" }, // longer
      { id: 1, citation: "B" },       // shorter
    ];

    const result = applyCorrections(text, contexts, corrections);
    expect(result.text).toBe("AAAAAAA then B end");
    expect(result.appliedCorrections).toHaveLength(2);
  });

  it("throws on missing correction for a context", () => {
    const text = "AAA BBB";
    const contexts = [
      makeContext(0, "AAA", 0, 3, "", "BBB"),
      makeContext(1, "BBB", 4, 7, "AAA", ""),
    ];
    const corrections = [{ id: 0, citation: "aaa" }]; // missing id 1

    expect(() => applyCorrections(text, contexts, corrections)).toThrow(
      "Missing correction for citation id 1"
    );
  });

  it("throws on unknown correction ID", () => {
    const text = "AAA rest";
    const contexts = [makeContext(0, "AAA", 0, 3, "", "rest")];
    const corrections = [
      { id: 0, citation: "aaa" },
      { id: 99, citation: "unknown" },
    ];

    expect(() => applyCorrections(text, contexts, corrections)).toThrow(
      "Unknown correction id 99"
    );
  });
});
