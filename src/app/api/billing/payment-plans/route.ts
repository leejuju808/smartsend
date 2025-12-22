// Block 240000 — SmartSend Roofing Billing & Payments Hub
// GET /api/billing/payment-plans
// List payment plans

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
    const homeownerId = searchParams.get("homeowner_id");
    const workspaceId = searchParams.get("workspace_id");
    const jobId = searchParams.get("job_id");

    let query = supabase
      .from("payment_plans")
      .select("*")
      .order("created_at", { ascending: false });

    if (homeownerId) {
      query = query.eq("homeowner_id", homeownerId);
    }

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data: paymentPlans, error } = await query;

    if (error) {
      console.error("Error fetching payment plans:", error);
      return NextResponse.json(
        { error: "Failed to fetch payment plans", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payment_plans: paymentPlans || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/billing/payment-plans:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























