import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/insurance/alerts
 * Get insurance risk alerts for workspace or specific contact
 * 
 * Query params:
 *   contact_id?: string - Filter by contact
 *   resolved?: boolean - Filter by resolved status (default: false)
 *   limit?: number - Limit results (default: 50)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const contactId = searchParams.get("contact_id");
    const resolved = searchParams.get("resolved") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");

    // Build query
    let query = supabase
      .from("insurance_risk_alerts")
      .select(`
        *,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("workspace_id", workspaceId)
      .eq("is_resolved", resolved)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (contactId) {
      query = query.eq("contact_id", contactId);
    }

    const { data: alerts, error: alertsError } = await query;

    if (alertsError) {
      console.error("Error fetching insurance alerts:", alertsError);
      return NextResponse.json({ error: alertsError.message }, { status: 500 });
    }

    return NextResponse.json({
      alerts: alerts || [],
      count: alerts?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/insurance/alerts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/insurance/alerts
 * Resolve an insurance alert
 * 
 * Body: {
 *   alert_id: string
 * }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json();
    const { alert_id } = body;

    if (!alert_id) {
      return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
    }

    // Verify alert belongs to workspace
    const { data: alert, error: alertError } = await supabase
      .from("insurance_risk_alerts")
      .select("id, workspace_id")
      .eq("id", alert_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (alertError || !alert) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    // Resolve alert
    const { data: updatedAlert, error: updateError } = await supabase
      .from("insurance_risk_alerts")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq("id", alert_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error resolving alert:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      alert: updatedAlert,
      message: "Alert resolved successfully",
    });
  } catch (error: any) {
    console.error("Error in PATCH /api/insurance/alerts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































