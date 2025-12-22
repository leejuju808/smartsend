// Block 62000 — SmartSend Roofing Material Cost Updater API v1
// POST /api/materials/update-cost
// Owner updates material pricing

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, item_name, unit, unit_cost, supplier_id, brand, model, color, sku } = body;

    if (!workspace_id || !item_name || !unit || unit_cost === undefined) {
      return NextResponse.json(
        { error: "workspace_id, item_name, unit, and unit_cost are required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Call edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/materials-update-cost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        workspace_id,
        item_name,
        unit,
        unit_cost,
        supplier_id,
        brand,
        model,
        color,
        sku
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to update cost", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Error in /api/materials/update-cost:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























