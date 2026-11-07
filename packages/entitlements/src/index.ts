import { DEFAULT_PLAN, PLANS, type BillingInterval, type Currency, type Feature, type Limit, type PlanConfig, type PlanKey } from "./plans";

export * from "./plans";

/**
 * A workspace's effective entitlements: its plan plus any per-workspace
 * overrides (used for Agency contracts and promotions).
 */
export type Entitlements = {
  plan: PlanConfig;
  limitOverrides?: Partial<Record<Limit, number>>;
  featureOverrides?: Partial<Record<Feature, boolean>>;
};

export function getPlan(key: string | null | undefined): PlanConfig {
  if (key && key in PLANS) return PLANS[key as PlanKey];
  return PLANS[DEFAULT_PLAN];
}

export function entitlementsFor(
  planKey: string | null | undefined,
  overrides: Pick<Entitlements, "limitOverrides" | "featureOverrides"> = {},
): Entitlements {
  return { plan: getPlan(planKey), ...overrides };
}

export function can(ent: Entitlements, feature: Feature): boolean {
  const override = ent.featureOverrides?.[feature];
  if (override !== undefined) return override;
  return ent.plan.features.has(feature);
}

export function limitOf(ent: Entitlements, limit: Limit): number {
  return ent.limitOverrides?.[limit] ?? ent.plan.limits[limit];
}

export type LimitCheck = {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
};

/** Would adding `adding` units keep usage within the limit? */
export function checkLimit(ent: Entitlements, limit: Limit, used: number, adding = 1): LimitCheck {
  const max = limitOf(ent, limit);
  return {
    allowed: used + adding <= max,
    limit: max,
    used,
    remaining: Math.max(0, max - used),
  };
}

export class EntitlementError extends Error {
  constructor(
    public readonly reason: { kind: "feature"; feature: Feature } | { kind: "limit"; limit: Limit; check: LimitCheck },
  ) {
    super(reason.kind === "feature" ? `Your plan doesn't include ${reason.feature}` : `Plan limit reached: ${reason.limit}`);
    this.name = "EntitlementError";
  }
}

export function assertCan(ent: Entitlements, feature: Feature): void {
  if (!can(ent, feature)) throw new EntitlementError({ kind: "feature", feature });
}

export function assertWithinLimit(ent: Entitlements, limit: Limit, used: number, adding = 1): void {
  const check = checkLimit(ent, limit, used, adding);
  if (!check.allowed) throw new EntitlementError({ kind: "limit", limit, check });
}

/** Price in minor units, or null when custom / not sold in that currency. */
export function priceOf(plan: PlanConfig, interval: BillingInterval, currency: Currency = "NGN"): number | null {
  return plan.prices[currency]?.[interval] ?? null;
}

export function formatPrice(minor: number | null, currency: Currency = "NGN"): string {
  if (minor === null) return "Custom";
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}
