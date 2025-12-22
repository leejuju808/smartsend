import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const serverSupabase = createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const org_id = searchParams.get("org_id");

    if (!org_id) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400 });
    }

    // Get domain settings for org
    const { data: domainSettings, error: dsError } = await supabase
      .from("domain_settings")
      .select("*")
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (dsError || !domainSettings) {
      return NextResponse.json({
        ok: true,
        domain: null,
        health: null,
        dns: null,
        warmup: null,
        events: [],
        bounce_trend: [],
        complaint_trend: [],
      });
    }

    // Get domain health
    const { data: domainHealth } = await supabase
      .from("domain_health")
      .select("*")
      .eq("domain_settings_id", domainSettings.id)
      .single();

    // Get warmup state
    const { data: warmupState } = await supabase
      .from("domain_warmup_state")
      .select("*")
      .eq("domain_settings_id", domainSettings.id)
      .single();

    // Get recent deliverability events
    const { data: events } = await supabase
      .from("deliverability_events")
      .select("*")
      .eq("domain_settings_id", domainSettings.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get bounce trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: bounces } = await supabase
      .from("bounce_events")
      .select("created_at, bounce_type")
      .eq("workspace_id", org_id)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    // Get complaint trend (last 30 days)
    const { data: complaints } = await supabase
      .from("complaint_events")
      .select("created_at")
      .eq("workspace_id", org_id)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    // Process bounce trend (daily aggregation)
    const bounceTrend = processTrendData(bounces || [], "bounce");
    const complaintTrend = processTrendData(complaints || [], "complaint");

    return NextResponse.json({
      ok: true,
      domain: domainSettings,
      health: domainHealth,
      dns: {
        spf: domainSettings.spf_pass || false,
        dkim: domainSettings.dkim_pass || false,
        dmarc: domainSettings.dmarc_pass || false,
        mx: domainSettings.mx_pass || false,
      },
      warmup: warmupState,
      events: events || [],
      bounce_trend: bounceTrend,
      complaint_trend: complaintTrend,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function processTrendData(
  data: any[],
  type: "bounce" | "complaint"
): Array<{ date: string; count: number }> {
  const trendMap = new Map<string, number>();

  data.forEach((item) => {
    const date = new Date(item.created_at).toISOString().split("T")[0];
    const current = trendMap.get(date) || 0;
    trendMap.set(date, current + 1);
  });

  // Fill in missing dates with 0
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const today = new Date();

  const trend: Array<{ date: string; count: number }> = [];
  for (
    let d = new Date(thirtyDaysAgo);
    d <= today;
    d.setDate(d.getDate() + 1)
  ) {
    const dateStr = d.toISOString().split("T")[0];
    trend.push({
      date: dateStr,
      count: trendMap.get(dateStr) || 0,
    });
  }

  return trend;
}





















































