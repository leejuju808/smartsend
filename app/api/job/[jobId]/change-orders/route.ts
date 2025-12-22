// Block 27700 — SmartSend Roofing Change Order Engine v1
// API Route: GET /api/job/[jobId]/change-orders
// Get all change orders for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createRouteHandlerClient({ cookies });

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", job.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Fetch change orders with revenue amounts
    const { data: changeOrders, error: coError } = await supabase
      .from("roofing_change_orders")
      .select(`
        id,
        status,
        reason_category,
        created_at,
        approved_at,
        rejected_at,
        roofing_change_order_revenue(amount, approved)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (coError) {
      console.error("Error fetching change orders:", coError);
      return NextResponse.json(
        { error: "Failed to fetch change orders" },
        { status: 500 }
      );
    }

    // Format response with amount from revenue table
    const orders = (changeOrders || []).map((co: any) => ({
      id: co.id,
      status: co.status,
      reason_category: co.reason_category,
      created_at: co.created_at,
      approved_at: co.approved_at,
      rejected_at: co.rejected_at,
      amount: co.roofing_change_order_revenue?.[0]?.amount || 0,
    }));

    return NextResponse.json({ orders });
  } catch (error: any) {
    console.error("Error in GET /api/job/[jobId]/change-orders:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































