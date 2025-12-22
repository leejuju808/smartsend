// lib/planMapping.ts
// Maps Stripe price IDs to internal plan keys

export function planKeyFromPrice(priceId: string | null): "free" | "starter" | "growth" | "domination" {
  if (!priceId) return "free";

  // Support both old and new environment variable names
  if (
    priceId === process.env.STRIPE_PRICE_STARTER_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_SMARTSEND_STARTER
  )
    return "starter";
  if (
    priceId === process.env.STRIPE_PRICE_GROWTH_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_SMARTSEND_GROWTH
  )
    return "growth";
  if (
    priceId === process.env.STRIPE_PRICE_DOMINATION_MONTHLY ||
    priceId === process.env.STRIPE_PRICE_SMARTSEND_DOMINATION
  )
    return "domination";

  // Default to free
  return "free";
}

