// Block 254400 — SmartSend Lifetime Value Engine v1
// API Route: Run Automation Checks
// POST /api/customers/automation/run - Run automation checks (roof age, warranty, maintenance, upsells, re-engagement)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { team_id, checks } = body;

    if (!team_id) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    // Verify user is team member
    const { data: membership } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const results: any = {};

    // Run requested checks (or all if not specified)
    const checksToRun = checks || [
      "roof_age",
      "warranty_expiration",
      "maintenance_due",
      "upsell_recommendations",
      "re_engagement",
    ];

    if (checksToRun.includes("roof_age")) {
      const { error } = await supabase.rpc("check_roof_age_alerts", {
        p_team_id: team_id,
      });
      results.roof_age = error ? { error: error.message } : { success: true };
    }

    if (checksToRun.includes("warranty_expiration")) {
      const { error } = await supabase.rpc("check_warranty_expiration_alerts", {
        p_team_id: team_id,
      });
      results.warranty_expiration = error
        ? { error: error.message }
        : { success: true };
    }

    if (checksToRun.includes("maintenance_due")) {
      const { error } = await supabase.rpc("check_maintenance_due", {
        p_team_id: team_id,
      });
      results.maintenance_due = error
        ? { error: error.message }
        : { success: true };
    }

    if (checksToRun.includes("upsell_recommendations")) {
      const { error } = await supabase.rpc("generate_upsell_recommendations", {
        p_team_id: team_id,
      });
      results.upsell_recommendations = error
        ? { error: error.message }
        : { success: true };
    }

    if (checksToRun.includes("re_engagement")) {
      const { error } = await supabase.rpc("create_reengagement_events", {
        p_team_id: team_id,
      });
      results.re_engagement = error
        ? { error: error.message }
        : { success: true };
    }

    return NextResponse.json({
      ok: true,
      results,
    });
  } catch (error: any) {
    console.error("Error in automation API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















