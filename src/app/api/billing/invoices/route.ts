// Block 240000 — SmartSend Roofing Billing & Payments Hub
// GET /api/billing/invoices
// List invoices with filters

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const homeownerId = searchParams.get("homeowner_id");
    const jobId = searchParams.get("job_id");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (homeownerId) {
      // Need to join with jobs/leads to get homeowner
      // For now, we'll filter by job_id if provided
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch invoices", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      invoices: invoices || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/billing/invoices:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























