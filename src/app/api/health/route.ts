import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/server/supabase";

export async function GET() {
  const checks: Record<string, any> = {};
  try {
    const { error: sberr } = await supabaseAdmin.rpc("now");
    checks.supabase = sberr ? { ok: false, err: String(sberr) } : { ok: true };
  } catch (e: any) {
    checks.supabase = { ok: false, err: String(e) };
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2024-06-20" });
    checks.stripe = stripe ? { ok: true } : { ok: false, err: "init" };
  } catch (e: any) {
    checks.stripe = { ok: false, err: String(e) };
  }

  return NextResponse.json({ ok: Object.values(checks).every((c: any) => c.ok), checks });
}

