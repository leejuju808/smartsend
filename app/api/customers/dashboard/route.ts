// Block 254400 — SmartSend Lifetime Value Engine v1
// API Route: Customer Value Dashboard
// GET /api/customers/dashboard - Get customer lifetime value metrics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const team_id = searchParams.get("team_id");

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

    // Get lifetime value summary
    const { data: ltvSummary } = await supabase
      .from("v_customer_lifetime_value_summary")
      .select("*")
      .eq("team_id", team_id)
      .single();

    // Get customer events summary
    const { data: eventsSummary } = await supabase
      .from("v_customer_events_dashboard")
      .select("*")
      .eq("team_id", team_id);

    // Get upsell recommendations summary
    const { data: upsellsSummary } = await supabase
      .from("v_upsell_recommendations_summary")
      .select("*")
      .eq("team_id", team_id);

    // Get referral performance
    const { data: referralPerformance } = await supabase
      .from("v_referral_performance")
      .select("*")
      .eq("team_id", team_id)
      .single();

    // Get pending events count
    const { data: pendingEvents } = await supabase
      .from("customer_events")
      .select("event_type, priority, count", { count: "exact" })
      .eq("team_id", team_id)
      .eq("status", "pending");

    // Get recent repeat jobs (customers with multiple jobs)
    const { data: repeatCustomers } = await supabase
      .from("customers")
      .select("id, name, total_jobs, lifetime_value, last_job_date")
      .eq("team_id", team_id)
      .gt("total_jobs", 1)
      .order("lifetime_value", { ascending: false })
      .limit(10);

    // Get top customers by lifetime value
    const { data: topCustomers } = await supabase
      .from("customers")
      .select("id, name, lifetime_value, total_jobs, referral_count")
      .eq("team_id", team_id)
      .order("lifetime_value", { ascending: false })
      .limit(10);

    return NextResponse.json({
      ok: true,
      dashboard: {
        lifetime_value_summary: ltvSummary || {},
        events_summary: eventsSummary || [],
        upsells_summary: upsellsSummary || [],
        referral_performance: referralPerformance || {},
        pending_events: pendingEvents || [],
        repeat_customers: repeatCustomers || [],
        top_customers: topCustomers || [],
      },
    });
  } catch (error: any) {
    console.error("Error in customer dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















