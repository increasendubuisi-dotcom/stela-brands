import { describe, expect, it } from "vitest";
import { assertCan, assertWithinLimit, can, checkLimit, EntitlementError, entitlementsFor, formatPrice, getPlan, PLANS, priceOf } from "./index";

describe("plans", () => {
  it("uses the brief's monthly Naira prices", () => {
    expect(priceOf(PLANS.basic, "monthly")).toBe(500_000);
    expect(priceOf(PLANS.ai, "monthly")).toBe(1_000_000);
    expect(priceOf(PLANS.studio, "monthly")).toBe(1_500_000);
    expect(priceOf(PLANS.agency, "monthly")).toBeNull();
  });

  it("formats prices for display", () => {
    expect(formatPrice(500_000)).toMatch(/5,000/);
    expect(formatPrice(null)).toBe("Custom");
  });

  it("falls back to Starter for unknown plan keys", () => {
    expect(getPlan("enterprise-xl").key).toBe("starter");
    expect(getPlan(null).key).toBe("starter");
  });

  it("each paid tier includes everything the cheaper tier offers", () => {
    const order = [PLANS.basic, PLANS.ai, PLANS.studio, PLANS.agency];
    for (let i = 1; i < order.length; i++) {
      for (const f of order[i - 1]!.features) expect(order[i]!.features.has(f), `${order[i]!.key} lacks ${f}`).toBe(true);
    }
  });
});

describe("can / limits", () => {
  it("gates AI to AI tier and above", () => {
    expect(can(entitlementsFor("basic"), "ai_assistant")).toBe(false);
    expect(can(entitlementsFor("ai"), "ai_assistant")).toBe(true);
  });

  it("honours per-workspace overrides", () => {
    const ent = entitlementsFor("basic", { featureOverrides: { custom_domain: true }, limitOverrides: { seats: 4 } });
    expect(can(ent, "custom_domain")).toBe(true);
    expect(checkLimit(ent, "seats", 3).allowed).toBe(true);
  });

  it("checks limits including the unit being added", () => {
    const ent = entitlementsFor("starter");
    expect(checkLimit(ent, "published_guides", 0)).toEqual({ allowed: true, limit: 1, used: 0, remaining: 1 });
    expect(checkLimit(ent, "published_guides", 1).allowed).toBe(false);
    expect(checkLimit(entitlementsFor("studio"), "brands", 10_000).allowed).toBe(true);
  });

  it("throws typed errors the UI can turn into upgrade prompts", () => {
    expect(() => assertCan(entitlementsFor("starter"), "ai_assistant")).toThrow(EntitlementError);
    try {
      assertWithinLimit(entitlementsFor("starter"), "brands", 2);
    } catch (e) {
      expect(e).toBeInstanceOf(EntitlementError);
      expect((e as EntitlementError).reason).toMatchObject({ kind: "limit", limit: "brands" });
    }
  });
});
