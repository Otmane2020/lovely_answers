import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Publishable key — safe to expose client-side. Force the live key when an old
// placeholder/test build variable is still present in the preview environment.
const FALLBACK_STRIPE_PUBLISHABLE_KEY =
  "pk_live_51OkmX3Efti9t9nN9Mlecdj4IgnmMGkECjdGaN85Qg6QJ1KoVOF3KQmX7Cj9aOQiTnolZG7MhJ2qSLS85QqEwJOpM00UBMNxh2H";

const resolveStripePublishableKey = () => {
  const envKey = ((import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
  return envKey.startsWith("pk_live_") && !envKey.includes("REPLACE_ME")
    ? envKey
    : FALLBACK_STRIPE_PUBLISHABLE_KEY;
};

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(resolveStripePublishableKey());
  }
  return stripePromise;
}
