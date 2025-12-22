import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const authClient = createRouteHandlerClient({ cookies });
    const { data: { user } } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { accountId, action, percent } = body;

    if (!accountId || !action) {
      return NextResponse.json({ error: "accountId and action are required" }, { status: 400 });
    }

    // Verify account belongs to user (check accounts table)
    const { data: account } = await authClient
      .from("accounts")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Use service role for updates
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get current profile
    const { data: profile } = await supabase
      .from("account_warmup_profiles")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Warmup profile not found" }, { status: 404 });
    }

    let updates: Record<string, any> = {};

    switch (action) {
      case "pause":
        updates.enabled = !profile.enabled;
        break;

      case "reset":
        updates.daily_ramp_start = 30;
        updates.daily_ramp_increment = 30;
        updates.daily_ramp_cap = 300;
        updates.adaptive_factor = 1.0;
        break;

      case "boost":
        const boostPercent = percent || 20;
        const boostMultiplier = 1 + (boostPercent / 100);
        updates.adaptive_factor = Math.min(1.5, (profile.adaptive_factor || 1.0) * boostMultiplier);
        updates.daily_ramp_increment = Math.round((profile.daily_ramp_increment || 30) * updates.adaptive_factor);
        updates.daily_ramp_cap = Math.min(2000, Math.round((profile.daily_ramp_cap || 300) * updates.adaptive_factor));
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const { error } = await supabase
      .from("account_warmup_profiles")
      .update(updates)
      .eq("account_id", accountId);

    if (error) {
      console.error("Failed to update warmup profile:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Warmup action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}














