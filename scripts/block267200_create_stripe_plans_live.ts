#!/usr/bin/env tsx

/**
 * BLOCK 267200 — Create Stripe plans (LIVE)
 *
 * Creates 3 monthly recurring prices:
 * - Starter: $99/mo
 * - Growth: $199/mo
 * - Domination: $399/mo
 *
 * Prints env vars to paste:
 * - STRIPE_PRICE_STARTER_ID
 * - STRIPE_PRICE_GROWTH_ID
 * - STRIPE_PRICE_DOMINATION_ID
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... tsx scripts/block267200_create_stripe_plans_live.ts
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Missing env: STRIPE_SECRET_KEY (must be LIVE key)");
  process.exit(1);
}

if (!key.startsWith("sk_live_")) {
  console.error("BLOCK STOP: STRIPE_SECRET_KEY is not a live key (expected sk_live_...)");
  process.exit(2);
}

const stripe = new Stripe(key, { apiVersion: "2024-11-20.acacia" });

async function createPlan(opts: { name: string; amountUsd: number }) {
  const product = await stripe.products.create({
    name: `SmartSend ${opts.name}`,
    metadata: { block: "267200", plan: opts.name.toLowerCase() },
  });

  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: opts.amountUsd * 100,
    recurring: { interval: "month" },
    nickname: opts.name,
    metadata: { block: "267200", plan: opts.name.toLowerCase() },
  });

  return { productId: product.id, priceId: price.id };
}

async function main() {
  const starter = await createPlan({ name: "Starter", amountUsd: 99 });
  const growth = await createPlan({ name: "Growth", amountUsd: 199 });
  const domination = await createPlan({ name: "Domination", amountUsd: 399 });

  console.log("");
  console.log("Created Stripe prices:");
  console.log(`Starter: ${starter.priceId} (product ${starter.productId})`);
  console.log(`Growth: ${growth.priceId} (product ${growth.productId})`);
  console.log(`Domination: ${domination.priceId} (product ${domination.productId})`);
  console.log("");
  console.log("Paste these env vars:");
  console.log(`STRIPE_PRICE_STARTER_ID=${starter.priceId}`);
  console.log(`STRIPE_PRICE_GROWTH_ID=${growth.priceId}`);
  console.log(`STRIPE_PRICE_DOMINATION_ID=${domination.priceId}`);
  console.log("");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});








