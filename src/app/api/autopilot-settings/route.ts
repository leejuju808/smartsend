import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";

/**
 * Org-level autopilot settings (guardrails + review mode).
 *
 * NOTE:
 * - This is intentionally separate from `/api/autopilot`, which is workspace-level
 *   “True Autopilot Mode” (Block 273000) and is enforced via workspace policy.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = serverClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("autopilot_settings")
      .select("*")
      .eq("org_id", org.id)
      .maybeSingle();

    // PGRST116 is "not found" in some setups; maybeSingle() should avoid it,
    // but keep this safe anyway.
    if (error && (error as any).code !== "PGRST116") {
      return NextResponse.json({ error: (error as any).message || "Failed to load settings" }, { status: 500 });
    }

    // Return defaults if no settings exist
    if (!data) {
      return NextResponse.json({
        enabled: false,
        daily_send_limit: 200,
        quiet_hours: { start: "22:00", end: "06:00" },
        review_mode: true,
        org_id: org.id,
      });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching autopilot settings:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = serverClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { enabled, daily_send_limit, quiet_hours, review_mode } = body as any;

    const updates: any = {
      org_id: org.id,
      updated_at: new Date().toISOString(),
    };

    if (enabled !== undefined) updates.enabled = enabled;
    if (daily_send_limit !== undefined) updates.daily_send_limit = daily_send_limit;
    if (quiet_hours !== undefined) updates.quiet_hours = quiet_hours;
    if (review_mode !== undefined) updates.review_mode = review_mode;

    // Reset daily counter if needed (when limit changes or enabled)
    if (enabled === true || daily_send_limit !== undefined) {
      updates.last_reset = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("autopilot_settings")
      .upsert(updates, { onConflict: "org_id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: data });
  } catch (error: any) {
    console.error("Error updating autopilot settings:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}



