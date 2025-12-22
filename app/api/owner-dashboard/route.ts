// Block 26340 — SmartSend Roofing Profit & Collections Owner Dashboard v1
// API Route: Owner Dashboard Data
// GET /api/owner-dashboard

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;

    // Check if user is owner
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("owner_id")
      .eq("id", workspaceId)
      .single();

    if (!workspace || workspace.owner_id !== user.id) {
      // Check if user has owner role
      const { data: userRole } = await supabase
        .from("users")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (userRole?.role !== "owner") {
        return NextResponse.json({ error: "Owner access required" }, { status: 403 });
      }
    }

    // AR summary
    const { data: ar, error: arError } = await supabase
      .from("roofing_owner_ar_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (arError) {
      console.error("AR summary error:", arError);
    }

    // Cashflow 30d summary
    const { data: cf, error: cfError } = await supabase
      .from("roofing_owner_30day_cashflow_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (cfError) {
      console.error("Cashflow summary error:", cfError);
    }

    // Daily cashflow for chart
    const { data: cfDaily, error: cfDailyError } = await supabase
      .from("roofing_owner_30day_cashflow_daily")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("day", { ascending: true });

    if (cfDailyError) {
      console.error("Daily cashflow error:", cfDailyError);
    }

    // Fill in missing days with zero values for complete 30-day view
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    
    const dailyMap = new Map(
      (cfDaily || []).map((d) => [d.day, d])
    );
    
    const filledDaily = [];
    for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = d.toISOString().split("T")[0];
      if (dailyMap.has(dayStr)) {
        filledDaily.push(dailyMap.get(dayStr));
      } else {
        filledDaily.push({
          day: dayStr,
          workspace_id: workspaceId,
          incoming: 0,
          outgoing: 0,
          net: 0,
        });
      }
    }

    // Job profit (top and bottom 5 by margin)
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_owner_job_profit_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("margin", { ascending: false });

    if (jobsError) {
      console.error("Job profit error:", jobsError);
    }

    const sortedJobs = (jobs || []).sort((a, b) => (b.margin || 0) - (a.margin || 0));
    const topProfitable = sortedJobs.slice(0, 5);
    const bottomAtRisk = sortedJobs.slice(-5).reverse(); // Reverse to show lowest margin first

    // Overdue + soon due invoices
    const { data: invoices, error: invoicesError } = await supabase
      .from("roofing_invoice_balances")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gt("balance_due", 0)
      .order("due_date", { ascending: true });

    if (invoicesError) {
      console.error("Invoices error:", invoicesError);
    }

    const soon = new Date();
    soon.setDate(today.getDate() + 7);
    soon.setHours(23, 59, 59, 999);

    const overdue = (invoices || []).filter(
      (inv) =>
        inv.due_date &&
        new Date(inv.due_date) < today &&
        inv.balance_due > 0
    );

    const dueSoon = (invoices || []).filter(
      (inv) =>
        inv.due_date &&
        new Date(inv.due_date) >= today &&
        new Date(inv.due_date) <= soon &&
        inv.balance_due > 0
    );

    return NextResponse.json({
      ar: ar || { total_ar: 0, overdue_ar: 0, overdue_invoices_count: 0 },
      cashflowSummary: cf || { incoming_30d: 0, outgoing_30d: 0, net_30d: 0 },
      cashflowDaily: filledDaily || [],
      topProfitable: topProfitable || [],
      bottomAtRisk: bottomAtRisk || [],
      overdue: overdue || [],
      dueSoon: dueSoon || [],
    });
  } catch (error: any) {
    console.error("Owner dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































