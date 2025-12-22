// Block 87000 — Phone Dashboard API
// Returns metrics for the phone dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));

    // Get company/org ID
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .single();

    // Get phone numbers for this workspace
    const { data: phoneNumbers } = await supabase
      .from("phone_numbers")
      .select("id, number")
      .or(`workspace_id.eq.${workspaceId}`)
      .eq("is_active", true);

    const phoneNumberIds = phoneNumbers?.map((p) => p.id) || [];

    // Get company IDs
    const { data: companies } = await supabase
      .from("roofing_companies")
      .select("id")
      .or(`workspace_id.eq.${workspaceId}`);

    const companyIds = companies?.map((c) => c.id) || [];

    // Get org IDs
    const { data: orgs } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("user_id", user.id)
      .eq("status", "active");

    const orgIds = orgs?.map((o) => o.org_id) || [];

    // Metrics for today
    const { data: callsToday } = await supabase
      .from("call_logs")
      .select("id, call_status", { count: "exact" })
      .or(
        `workspace_id.eq.${workspaceId}${companyIds.length > 0 ? `,company_id.in.(${companyIds.join(",")})` : ""}${orgIds.length > 0 ? `,org_id.in.(${orgIds.join(",")})` : ""}`
      )
      .gte("started_at", todayStart.toISOString())
      .lte("started_at", todayEnd.toISOString());

    const missedCallsToday =
      callsToday?.filter((c) => c.call_status === "missed" || c.call_status === "no-answer").length || 0;

    const aiAnsweredCalls =
      callsToday?.filter((c) => c.call_status === "ai_answered").length || 0;

    // Text-back conversions (missed calls that got responses)
    const { data: textBacks } = await supabase
      .from("missed_call_texts")
      .select("id, homeowner_responded")
      .or(
        `workspace_id.eq.${workspaceId}${companyIds.length > 0 ? `,company_id.in.(${companyIds.join(",")})` : ""}${orgIds.length > 0 ? `,org_id.in.(${orgIds.join(",")})` : ""}`
      )
      .gte("created_at", todayStart.toISOString())
      .lte("created_at", todayEnd.toISOString());

    const textBackConversions =
      textBacks?.filter((t) => t.homeowner_responded).length || 0;

    // Booked inspections from calls
    const { data: bookedInspections } = await supabase
      .from("call_logs")
      .select("id")
      .or(
        `workspace_id.eq.${workspaceId}${companyIds.length > 0 ? `,company_id.in.(${companyIds.join(",")})` : ""}${orgIds.length > 0 ? `,org_id.in.(${orgIds.join(",")})` : ""}`
      )
      .eq("inspection_booked", true)
      .gte("started_at", todayStart.toISOString())
      .lte("started_at", todayEnd.toISOString());

    // Storm mode status
    const { data: stormSettings } = await supabase
      .from("ai_phone_settings")
      .select("storm_mode_active, storm_mode_enabled")
      .or(
        `workspace_id.eq.${workspaceId}${companyIds.length > 0 ? `,company_id.in.(${companyIds.join(",")})` : ""}${orgIds.length > 0 ? `,org_id.in.(${orgIds.join(",")})` : ""}`
      )
      .single();

    const stormModeActive =
      stormSettings?.storm_mode_active && stormSettings?.storm_mode_enabled;

    // Recent call logs
    const { data: recentCalls } = await supabase
      .from("call_logs")
      .select(
        `
        id,
        from_number,
        to_number,
        call_status,
        started_at,
        duration_seconds,
        ai_summary,
        lead_id,
        leads(id, email, first_name, last_name)
      `
      )
      .or(
        `workspace_id.eq.${workspaceId}${companyIds.length > 0 ? `,company_id.in.(${companyIds.join(",")})` : ""}${orgIds.length > 0 ? `,org_id.in.(${orgIds.join(",")})` : ""}`
      )
      .order("started_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      metrics: {
        missedCallsToday,
        textBackConversions,
        aiAnsweredCalls: aiAnsweredCalls || 0,
        bookedInspections: bookedInspections?.length || 0,
        stormModeActive,
      },
      recentCalls: recentCalls || [],
    });
  } catch (error) {
    console.error("Error fetching phone dashboard data:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}



























