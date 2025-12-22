import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase.from("v_campaign_health").select("*").order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ success: true, campaigns: data || [] });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { campaignId, patch } = await req.json() as {
      campaignId: string;
      patch: Partial<{
        status: "draft" | "running" | "paused" | "completed";
        daily_cap: number;
        ramp_step: number;
        max_daily_cap: number;
        max_bounce_pct: number;
        max_complaint_pct: number;
      }>;
    };

    if (!campaignId || !patch) {
      return NextResponse.json({ success: false, error: "campaignId and patch required" }, { status: 400 });
    }

    const { error } = await supabase.from("campaigns").update({
      ...patch,
      updated_at: new Date().toISOString()
    }).eq("id", campaignId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ success: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
