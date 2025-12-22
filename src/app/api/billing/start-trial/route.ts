import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST { userId }
 * Starts a 7-day trial if user is eligible (free && !trial_used).
 */
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ success: false, error: "userId required" }, { status: 400 });

    const { data: p, error } = await supabaseAdmin
      .from("profiles")
      .select("id, subscription_status, trial_used")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!p) return NextResponse.json({ success: false, error: "profile not found" }, { status: 404 });

    if (p.subscription_status === "active") {
      return NextResponse.json({ success: true, message: "Already active (paid)", started: false });
    }
    if (p.trial_used) {
      return NextResponse.json({ success: false, error: "Trial already used" }, { status: 403 });
    }

    const now = new Date();
    const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({
        subscription_status: "trialing",
        trial_started_at: now.toISOString(),
        trial_ends_at: ends.toISOString(),
        updated_at: now.toISOString()
      })
      .eq("id", userId);
    if (upErr) throw upErr;

    return NextResponse.json({ success: true, started: true, trialEndsAt: ends.toISOString() });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
