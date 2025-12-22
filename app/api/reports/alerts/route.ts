import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * GET /api/reports/alerts
 * Get predictive alerts for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const company_id = searchParams.get("company_id");
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!workspace_id) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    // Verify workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("predictive_alerts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("is_resolved", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (company_id) {
      query = query.eq("roofing_company_id", company_id);
    }

    const { data: alerts, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ alerts: alerts || [] });
  } catch (error: any) {
    console.error("Error fetching alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reports/alerts
 * Acknowledge or resolve an alert
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { alert_id, action } = body; // action: 'acknowledge' | 'resolve'

    if (!alert_id || !action) {
      return NextResponse.json(
        { error: "Missing alert_id or action" },
        { status: 400 }
      );
    }

    // Verify workspace membership via alert
    const { data: alert } = await supabase
      .from("predictive_alerts")
      .select("workspace_id")
      .eq("id", alert_id)
      .single();

    if (!alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", alert.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update alert
    const updateData: any = {};
    if (action === "acknowledge") {
      updateData.is_acknowledged = true;
      updateData.acknowledged_at = new Date().toISOString();
    } else if (action === "resolve") {
      updateData.is_resolved = true;
      updateData.resolved_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("predictive_alerts")
      .update(updateData)
      .eq("id", alert_id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating alert:", error);
    return NextResponse.json(
      { error: "Failed to update alert", details: error.message },
      { status: 500 }
    );
  }
}

























