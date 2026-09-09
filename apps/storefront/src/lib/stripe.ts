import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Publishable key only — safe to bundle client-side by Stripe's own design
// (PAYMENTS.md §8). The secret key and webhook secret never reach this app
// at all (apps/api only). loadStripe() is memoized by the library itself
// per unique key, but this module caches the promise too so every caller
// shares one Stripe.js load rather than re-injecting the script.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    // Matches PendingPaymentProvider's server-side fallback: no key
    // configured means no real payment in this environment, disclosed
    // rather than faked, not a crash.
    return Promise.resolve(null);
  }
  stripePromise ??= loadStripe(publishableKey);
  return stripePromise;
}
