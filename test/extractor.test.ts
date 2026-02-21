import { describe, it, expect } from "vitest";
import { extractCitations } from "../src/extractor.js";

describe("extractCitations", () => {
  it("finds a full case citation with reporter and year", () => {
    const text = "The court held in Marbury v. Madison, 5 U.S. 137 (1803) that";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("Marbury v. Madison");
    expect(result[0].original).toContain("5 U.S. 137");
  });

  it("finds a case citation with F.3d reporter", () => {
    const text = "as held in Smith v. Jones, 456 F.3d 789 (2d Cir. 2006).";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("Smith v. Jones");
    expect(result[0].original).toContain("456 F.3d 789");
  });

  it("finds a case citation with F. Supp. 3d reporter", () => {
    const text = "In Doe v. Roe, 100 F. Supp. 3d 200 (S.D.N.Y. 2015), the court noted";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("Doe v. Roe");
    expect(result[0].original).toContain("F. Supp. 3d");
  });

  it("finds a case citation with S. Ct. reporter", () => {
    const text = "as stated in Brown v. Board, 347 S. Ct. 483 (1954), the ruling";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("Brown v. Board");
  });

  it("finds a statutory citation with U.S.C.", () => {
    const text = "Under 42 U.S.C. § 1983, a plaintiff may bring suit.";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("42 U.S.C. § 1983");
  });

  it("finds a statutory citation with C.F.R.", () => {
    const text = "as required by 29 C.F.R. § 1926.1053 and related provisions.";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("29 C.F.R. § 1926.1053");
  });

  it("finds Id. short form", () => {
    const text = "The Court agreed. Id. at 155.";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("Id.");
  });

  it("finds standalone Id.", () => {
    const text = "The Court agreed. Id. The dissent argued otherwise.";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toBe("Id.");
  });

  it("finds multiple citations in a paragraph", () => {
    const text =
      "In Marbury v. Madison, 5 U.S. 137 (1803), the Court established judicial review. " +
      "Under 42 U.S.C. § 1983, plaintiffs may sue. Id. at 150.";
    const result = extractCitations(text);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array for text with no citations", () => {
    const text = "This is a plain paragraph with no legal citations at all.";
    const result = extractCitations(text);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const result = extractCitations("");
    expect(result).toHaveLength(0);
  });

  it("assigns sequential ids", () => {
    const text =
      "First, 42 U.S.C. § 1983. Second, 28 U.S.C. § 1331. Third, Id.";
    const result = extractCitations(text);
    expect(result.map((c) => c.id)).toEqual([0, 1, 2]);
  });

  it("extracts before and after context", () => {
    const text = "The holding in Smith v. Jones, 100 F.3d 200 (1st Cir. 1996) was significant.";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].before).toContain("holding in");
    expect(result[0].after).toContain("significant");
  });

  it("respects custom contextSize", () => {
    const text = "A very long preamble before the citation. Smith v. Jones, 100 F.3d 200 (1st Cir. 1996) followed by more text.";
    const result = extractCitations(text, 10);
    expect(result).toHaveLength(1);
    expect(result[0].before.length).toBeLessThanOrEqual(15); // some slack for word boundary
  });

  it("handles citation at the start of text", () => {
    const text = "Marbury v. Madison, 5 U.S. 137 (1803) established judicial review.";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].before).toBe("");
  });

  it("handles citation at the end of text", () => {
    const text = "The Court relied on Marbury v. Madison, 5 U.S. 137 (1803)";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].after).toBe("");
  });

  it("finds F.4th reporter citations", () => {
    const text = "See Garcia v. Texas, 50 F.4th 300 (5th Cir. 2022).";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("F.4th");
  });

  it("finds short form with reporter", () => {
    const text = "The court held that. Smith, 456 F.3d at 792.";
    const result = extractCitations(text);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const shortForm = result.find((c) => c.original.includes("at 792"));
    expect(shortForm).toBeDefined();
  });

  it("finds case citation with pincite", () => {
    const text = "as stated in Doe v. Roe, 100 F.3d 200, 205 (1st Cir. 1996).";
    const result = extractCitations(text);
    expect(result).toHaveLength(1);
    expect(result[0].original).toContain("205");
  });

  describe("signal-prefix inclusion", () => {
    it("includes 'See' signal immediately before a case citation", () => {
      const text = "The rule is clear. See Smith v. Jones, 100 F.3d 200 (1st Cir. 1996).";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      expect(result[0].original).toMatch(/^See\s/);
      expect(result[0].original).toContain("Smith v. Jones");
    });

    it("includes 'Cf.' signal immediately before a case citation", () => {
      const text = "The rule differs. Cf. Doe v. Roe, 50 F.3d 400 (2d Cir. 2000).";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      expect(result[0].original).toMatch(/^Cf\.\s/);
      expect(result[0].original).toContain("Doe v. Roe");
    });

    it("includes 'See also' signal before a case citation", () => {
      const text = "This applies broadly. See also Adams v. Baker, 200 U.S. 50 (1905).";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      expect(result[0].original).toMatch(/^See also\s/);
      expect(result[0].original).toContain("Adams v. Baker");
    });

    it("includes 'But see' signal before a case citation", () => {
      const text = "The majority disagrees. But see Clark v. Davis, 75 F.4th 100 (9th Cir. 2023).";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      expect(result[0].original).toMatch(/^But see\s/);
      expect(result[0].original).toContain("Clark v. Davis");
    });

    it("includes 'E.g.,' signal before a statutory citation", () => {
      const text = "Several statutes apply. E.g., 42 U.S.C. § 1983.";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      expect(result[0].original).toMatch(/^E\.g\.,\s/);
      expect(result[0].original).toContain("42 U.S.C. § 1983");
    });

    it("includes 'Accord' signal before a case citation", () => {
      const text = "Other circuits agree. Accord Evans v. Frank, 300 F.3d 150 (3d Cir. 2002).";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      expect(result[0].original).toMatch(/^Accord\s/);
      expect(result[0].original).toContain("Evans v. Frank");
    });

    it("does not include a signal that is far from the citation", () => {
      const text = "See the discussion above. Unrelated sentence. Smith v. Jones, 100 F.3d 200 (1st Cir. 1996).";
      const result = extractCitations(text);
      expect(result).toHaveLength(1);
      // "See" is too far away; original should start with the case name
      expect(result[0].original).toMatch(/^Smith/);
    });
  });
});
