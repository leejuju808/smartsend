// Block 22510 — SmartSend Roofing Material Cost History & Price Spike Alerts v1
// API Route: /api/material/price-alerts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  // Get query params for filtering
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // 'open', 'acknowledged', 'dismissed', or null for all

  try {
    let query = supabase
      .from("material_price_alerts")
      .select(
        `
        *,
        suppliers:supplier_id (
          id,
          name
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error("Price alerts fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map supplier name to alerts
    const alertsWithSupplier = (alerts || []).map((alert: any) => ({
      ...alert,
      supplier_name: alert.suppliers?.name || null,
    }));

    return NextResponse.json({ alerts: alertsWithSupplier });
  } catch (error) {
    console.error("Price alerts API error:", error);
    return NextResponse.json(
      { error: "Failed to load price alerts" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  const body = await req.json();
  const { alert_id, status } = body;

  if (!alert_id || !status) {
    return NextResponse.json(
      { error: "alert_id and status are required" },
      { status: 400 }
    );
  }

  if (!["open", "acknowledged", "dismissed"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be 'open', 'acknowledged', or 'dismissed'" },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("material_price_alerts")
      .update({ status })
      .eq("id", alert_id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (error) {
      console.error("Price alert update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alert: data });
  } catch (error) {
    console.error("Price alert update API error:", error);
    return NextResponse.json(
      { error: "Failed to update price alert" },
      { status: 500 }
    );
  }
}







































