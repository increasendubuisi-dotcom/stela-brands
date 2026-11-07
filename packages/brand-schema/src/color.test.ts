import { describe, expect, it } from "vitest";
import { colorValues, contrastRatio, hexToCmyk, hexToRgb, isValidHex, normalizeHex, rgbToHex } from "./color";

describe("hex handling", () => {
  it("normalises short and lowercase hex", () => {
    expect(normalizeHex("c84")).toBe("#CC8844");
    expect(normalizeHex(" #c8402b ")).toBe("#C8402B");
  });

  it("rejects invalid hex", () => {
    expect(isValidHex("#12345")).toBe(false);
    expect(isValidHex("zzzzzz")).toBe(false);
    expect(() => normalizeHex("#GG0000")).toThrow();
  });

  it("round-trips hex and rgb", () => {
    expect(hexToRgb("#C8402B")).toEqual({ r: 200, g: 64, b: 43 });
    expect(rgbToHex({ r: 200, g: 64, b: 43 })).toBe("#C8402B");
    expect(() => rgbToHex({ r: 256, g: 0, b: 0 })).toThrow();
  });
});

describe("cmyk", () => {
  it("derives naive CMYK", () => {
    expect(hexToCmyk("#000000")).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(hexToCmyk("#FFFFFF")).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    expect(hexToCmyk("#C8402B")).toEqual({ c: 0, m: 68, y: 79, k: 22 });
  });

  it("prefers a designer override and flags derived values", () => {
    const override = { c: 0, m: 80, y: 95, k: 10 };
    expect(colorValues("#C8402B", override)).toMatchObject({ cmyk: override, cmykIsDerived: false });
    expect(colorValues("#C8402B").cmykIsDerived).toBe(true);
  });
});

describe("contrast", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });
});
