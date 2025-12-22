// Block 28412 — SmartSend Roofing Past Customer Reactivation Engine v1
// API Route: List Past Customers
// GET /api/reactivation/customers?workspace_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get past customers with reactivation event counts
    const { data: customers, error: customersError } = await supabase
      .from("past_customers")
      .select(`
        *,
        reactivation_events:reactivation_events (
          id,
          type,
          status,
          scheduled_at,
          sent_at,
          replied_at,
          booked_at
        )
      `)
      .eq("workspace_id", workspace_id)
      .order("job_completed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (customersError) {
      console.error("Error getting past customers:", customersError);
      return NextResponse.json(
        { error: "Failed to get past customers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ customers: customers || [] });
  } catch (error) {
    console.error("Error in reactivation customers API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


































