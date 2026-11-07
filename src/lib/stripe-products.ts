// Stripe products & pricing — AutoPilot GEO (USD)
// 3 tiers x 2 cycles. All prices in USD cents.

export type PlanId = "starter" | "pro" | "agency";
export type BillingCycle = "monthly" | "annual";

export interface PlanPrice {
  id: string;        // Stripe price_id
  amount: number;    // cents (period total)
  perMonth: number;  // display per month, cents
}

export interface PlanFeatures {
  prioritySEO: boolean;
  allCms: boolean;               // Pro/Agency: WP, Shopify, Webflow, Wix; Starter: WP+Shopify only
  planningUnlocked: boolean;     // Pro/Agency
  whiteLabel: boolean;           // Agency
  multiClient: boolean;          // Agency
  slackSupport: boolean;         // Agency
  competitorMonitoring: boolean; // Pro/Agency
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  popular?: boolean;
  sitesLimit: number;
  articlesLimit: number; // -1 = unlimited
  features: string[];
  capabilities: PlanFeatures;
  prices: Record<BillingCycle, PlanPrice>;
}

const STARTER_CAPS: PlanFeatures = {
  prioritySEO: false, allCms: false, planningUnlocked: false,
  whiteLabel: false, multiClient: false, slackSupport: false, competitorMonitoring: false,
};
const PRO_CAPS: PlanFeatures = {
  prioritySEO: true, allCms: true, planningUnlocked: true,
  whiteLabel: false, multiClient: false, slackSupport: false, competitorMonitoring: true,
};
const AGENCY_CAPS: PlanFeatures = {
  prioritySEO: true, allCms: true, planningUnlocked: true,
  whiteLabel: true, multiClient: true, slackSupport: true, competitorMonitoring: true,
};

export const FREE_CAPS: PlanFeatures = STARTER_CAPS;

/** -1 / null / undefined → unlimited. */
export function isUnlimited(limit: number | null | undefined): boolean {
  return limit == null || limit < 0;
}
/** Normalize a Stripe/DB numeric limit: -1 → null (= unlimited). */
export function normalizeLimit(limit: number | null | undefined): number | null {
  if (limit == null || limit < 0) return null;
  return limit;
}
export function capsForPlan(plan: PlanId | null | undefined): PlanFeatures {
  if (plan === "pro") return PRO_CAPS;
  if (plan === "agency") return AGENCY_CAPS;
  return STARTER_CAPS;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "For solo founders launching their AI visibility",
    sitesLimit: 1,
    articlesLimit: 10,
    capabilities: STARTER_CAPS,
    features: [
      "1 website",
      "10 AI-optimized articles / month",
      "ChatGPT, Gemini & Perplexity visibility tracking",
      "Auto-publish to WordPress / Shopify",
      "AEO Answers, Local & Shopping (bonus)",
      "Email support",
    ],
    prices: {
      monthly: { id: "price_1TZI35Efti9t9nN9yj0tBl4c", amount: 4900,  perMonth: 4900 },
      annual:  { id: "price_1TZIB3Efti9t9nN9A4NxsNsg", amount: 46800, perMonth: 3900 },
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "For growing brands serious about getting cited by AI",
    popular: true,
    sitesLimit: 3,
    articlesLimit: 30,
    capabilities: PRO_CAPS,
    features: [
      "3 websites",
      "30 AI-optimized articles / month",
      "Priority content generation",
      "Full visibility tracking + competitor monitoring",
      "Auto-publish to all CMS (WP, Shopify, Webflow, Wix…)",
      "AEO + Local + Shopping + Planning unlocked",
      "Priority email support",
    ],
    prices: {
      monthly: { id: "price_1TZIBYEfti9t9nN9lG9JGwUa", amount: 9900,  perMonth: 9900 },
      annual:  { id: "price_1TZIBfEfti9t9nN9ZYClUCvF", amount: 94800, perMonth: 7900 },
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    tagline: "For agencies managing multiple client sites",
    sitesLimit: 10,
    articlesLimit: -1,
    capabilities: AGENCY_CAPS,
    features: [
      "10 websites",
      "Unlimited AI-optimized articles",
      "White-label exports",
      "Multi-client dashboard",
      "Dedicated success manager",
      "Priority Slack support",
    ],
    prices: {
      monthly: { id: "price_1TZIBjEfti9t9nN9ToqTd8xu", amount: 19900,  perMonth: 19900 },
      annual:  { id: "price_1TZIBnEfti9t9nN9fmZiURZR", amount: 190800, perMonth: 15900 },
    },
  },
};

export function getPlan(planId: PlanId): Plan {
  return PLANS[planId];
}

export function getPlanPrice(planId: PlanId, cycle: BillingCycle): PlanPrice {
  return PLANS[planId].prices[cycle];
}

export function formatUSD(cents: number): string {
  const dollars = cents / 100;
  // Show without decimals when round
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

// ────────────── Legacy compat (cart system, used by older flows) ──────────────
// Keep PRODUCTS shape so cart pages don't crash. Maps "aeo" → Starter, "autoseo" → Pro.
export const PRODUCTS = {
  aeo: {
    id: "aeo",
    name: PLANS.starter.name,
    description: PLANS.starter.tagline,
    features: PLANS.starter.features,
    prices: {
      monthly: { id: PLANS.starter.prices.monthly.id, amount: PLANS.starter.prices.monthly.amount, display: "$49" },
      annual:  { id: PLANS.starter.prices.annual.id,  amount: PLANS.starter.prices.annual.amount,  display: "$468", savings: "$120" },
    },
  },
  autoseo: {
    id: "autoseo",
    name: PLANS.pro.name,
    description: PLANS.pro.tagline,
    features: PLANS.pro.features,
    prices: {
      monthly: { id: PLANS.pro.prices.monthly.id, amount: PLANS.pro.prices.monthly.amount, display: "$99" },
      annual:  { id: PLANS.pro.prices.annual.id,  amount: PLANS.pro.prices.annual.amount,  display: "$948", savings: "$240" },
    },
  },
} as const;

export type ProductId = keyof typeof PRODUCTS;

export interface CartItem {
  productId: ProductId;
  name: string;
  priceId: string;
  amount: number;
}

export function getProductPrice(productId: ProductId, cycle: BillingCycle) {
  return PRODUCTS[productId].prices[cycle];
}

export function formatPrice(amountInCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountInCents / 100);
}

export function calculateTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export function getMonthlyEquivalent(amount: number, cycle: BillingCycle): number {
  return cycle === "annual" ? Math.round(amount / 12) : amount;
}
