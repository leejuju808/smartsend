// app/api/billing/plans/route.ts
// Expose Stripe price IDs to frontend (safe, these are public)
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    starter: process.env.STRIPE_PRICE_SMARTSEND_STARTER || "",
    growth: process.env.STRIPE_PRICE_SMARTSEND_GROWTH || "",
    domination: process.env.STRIPE_PRICE_SMARTSEND_DOMINATION || "",
  });
}
