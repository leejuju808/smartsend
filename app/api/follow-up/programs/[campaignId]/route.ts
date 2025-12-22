import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/follow-up/programs/:campaignId
 * Returns program + rules + stats counters for leads (for UI)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get program
    const { data: program, error: programError } = await supabase
      .from("follow_up_programs")
      .select("*")
      .eq("campaign_id", params.campaignId)
      .eq("account_id", user.id)
      .maybeSingle();

    if (programError) {
      return NextResponse.json(
        { error: "Failed to fetch program" },
        { status: 500 }
      );
    }

    if (!program) {
      return NextResponse.json({ program: null, rules: [], stats: null });
    }

    // Get rules
    const { data: rules, error: rulesError } = await supabase
      .from("follow_up_rules")
      .select("*")
      .eq("program_id", program.id)
      .order("priority", { ascending: true });

    if (rulesError) {
      return NextResponse.json(
        { error: "Failed to fetch rules" },
        { status: 500 }
      );
    }

    // Get stats summary
    const { data: stats, error: statsError } = await supabase
      .from("lead_auto_follow_up_stats")
      .select("auto_follow_ups_sent, auto_follow_up_disabled")
      .eq("campaign_id", params.campaignId);

    const statsSummary = {
      total_leads: stats?.length || 0,
      leads_with_follow_ups: stats?.filter((s) => s.auto_follow_ups_sent > 0).length || 0,
      leads_disabled: stats?.filter((s) => s.auto_follow_up_disabled).length || 0,
      total_follow_ups_sent:
        stats?.reduce((sum, s) => sum + (s.auto_follow_ups_sent || 0), 0) || 0,
    };

    return NextResponse.json({
      program,
      rules: rules || [],
      stats: statsSummary,
    });
  } catch (error) {
    console.error("Error fetching follow-up program:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/follow-up/programs/:campaignId
 * Create/update program (is_enabled, max_follow_ups_per_lead, timezone)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      is_enabled,
      max_follow_ups_per_lead,
      timezone,
    } = body;

    // Check if program exists
    const { data: existing } = await supabase
      .from("follow_up_programs")
      .select("id")
      .eq("campaign_id", params.campaignId)
      .eq("account_id", user.id)
      .maybeSingle();

    const programData: any = {
      account_id: user.id,
      campaign_id: params.campaignId,
      is_enabled: is_enabled !== undefined ? is_enabled : true,
      max_follow_ups_per_lead: max_follow_ups_per_lead || 4,
      timezone: timezone || "America/Los_Angeles",
    };

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from("follow_up_programs")
        .update(programData)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to update program" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from("follow_up_programs")
        .insert(programData)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to create program" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({ program: result });
  } catch (error) {
    console.error("Error saving follow-up program:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























































