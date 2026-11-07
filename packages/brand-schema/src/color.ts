/**
 * Colour maths for brand tokens.
 *
 * HEX is the stored source of truth for a colour token. RGB is derived exactly.
 * CMYK is derived with the naive device-independent formula and is only a
 * starting point: print colour depends on paper and profile, so designers can
 * override it per token (`cmykOverride`). The UI must label derived CMYK as such.
 */

export type Rgb = { r: number; g: number; b: number };
export type Cmyk = { c: number; m: number; y: number; k: number };

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHex(input: string): boolean {
  return HEX_RE.test(input.trim());
}

/** Normalise to uppercase 6-digit form with a leading '#'. Throws on invalid input. */
export function normalizeHex(input: string): string {
  const match = HEX_RE.exec(input.trim());
  if (!match || !match[1]) throw new Error(`Invalid hex colour: "${input}"`);
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split("")
      .map((d) => d + d)
      .join("");
  }
  return `#${digits.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const n = normalizeHex(hex);
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  for (const v of [r, g, b]) {
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`RGB channel out of range: ${v}`);
    }
  }
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** Naive RGB → CMYK, rounded to whole percentages. */
export function rgbToCmyk({ r, g, b }: Rgb): Cmyk {
  // Integer form of the usual formula, so exact halves (e.g. 78.5) round the same way every time.
  const max = Math.max(r, g, b);
  if (max === 0) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((max - r) * 100) / max),
    m: Math.round(((max - g) * 100) / max),
    y: Math.round(((max - b) * 100) / max),
    k: Math.round(((255 - max) * 100) / 255),
  };
}

export function hexToCmyk(hex: string): Cmyk {
  return rgbToCmyk(hexToRgb(hex));
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two hex colours, e.g. 4.5 for AA body text. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ColorValues = { hex: string; rgb: Rgb; cmyk: Cmyk; cmykIsDerived: boolean };

/** All display values for a token, honouring a designer's CMYK override. */
export function colorValues(hex: string, cmykOverride?: Cmyk | null): ColorValues {
  const normalized = normalizeHex(hex);
  const rgb = hexToRgb(normalized);
  return {
    hex: normalized,
    rgb,
    cmyk: cmykOverride ?? rgbToCmyk(rgb),
    cmykIsDerived: !cmykOverride,
  };
}
