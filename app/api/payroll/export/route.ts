// Block 25500 — SmartSend Roofing Payroll & Crew Pay v1
// API Route: Payroll Export
// POST /api/payroll/export

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const {
      workspace_id,
      export_type,
      export_format,
      pay_period_start,
      pay_period_end,
      crew_ids,
    } = body;

    if (!workspace_id || !export_type || !pay_period_start || !pay_period_end) {
      return NextResponse.json(
        { error: "workspace_id, export_type, pay_period_start, and pay_period_end are required" },
        { status: 400 }
      );
    }

    // Verify user has access and is admin/owner
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Access denied. Admin or owner role required." },
        { status: 403 }
      );
    }

    // Get pay entries for the period
    let payQuery = supabase
      .from("crew_pay_entries")
      .select(`
        *,
        crew:crews(id, name),
        job:roofing_jobs(id, title, job_value)
      `)
      .eq("workspace_id", workspace_id)
      .eq("status", "approved")
      .gte("created_at", pay_period_start)
      .lte("created_at", pay_period_end);

    if (crew_ids && crew_ids.length > 0) {
      payQuery = payQuery.in("crew_id", crew_ids);
    }

    const { data: payEntries, error: payError } = await payQuery;

    if (payError) {
      console.error("Error fetching pay entries:", payError);
      return NextResponse.json(
        { error: payError.message || "Failed to fetch pay entries" },
        { status: 500 }
      );
    }

    // Format export data based on export type
    let exportData: any = {};
    let exportFileName = `payroll_export_${pay_period_start}_${pay_period_end}`;

    if (export_type === "csv" || export_format === "csv") {
      // CSV format
      const csvRows = [
        ["Crew", "Job", "Base Pay", "Bonuses", "Penalties", "Total Pay", "Hours", "Status"],
      ];

      payEntries?.forEach((entry: any) => {
        csvRows.push([
          entry.crew?.name || "Unknown",
          entry.job?.title || "Unknown",
          entry.base_pay?.toString() || "0",
          entry.bonuses_total?.toString() || "0",
          entry.penalties_total?.toString() || "0",
          entry.total_pay?.toString() || "0",
          entry.hours_worked?.toString() || "0",
          entry.status || "pending",
        ]);
      });

      exportData = {
        format: "csv",
        rows: csvRows,
        total_crew_count: new Set(payEntries?.map((e: any) => e.crew_id) || []).size,
        total_pay_amount: payEntries?.reduce((sum: number, e: any) => sum + (e.total_pay || 0), 0) || 0,
      };
      exportFileName += ".csv";
    } else if (export_type === "quickbooks") {
      // QuickBooks format (simplified)
      exportData = {
        format: "qbo",
        entries: payEntries?.map((entry: any) => ({
          crew_name: entry.crew?.name,
          job_title: entry.job?.title,
          amount: entry.total_pay,
          date: entry.created_at,
          description: `Payroll for ${entry.crew?.name} - ${entry.job?.title}`,
        })) || [],
        total_crew_count: new Set(payEntries?.map((e: any) => e.crew_id) || []).size,
        total_pay_amount: payEntries?.reduce((sum: number, e: any) => sum + (e.total_pay || 0), 0) || 0,
      };
      exportFileName += ".qbo";
    } else if (export_type === "gusto") {
      // Gusto format (simplified)
      exportData = {
        format: "gusto",
        employees: payEntries?.map((entry: any) => ({
          crew_id: entry.crew_id,
          crew_name: entry.crew?.name,
          amount: entry.total_pay,
          period_start: pay_period_start,
          period_end: pay_period_end,
        })) || [],
        total_crew_count: new Set(payEntries?.map((e: any) => e.crew_id) || []).size,
        total_pay_amount: payEntries?.reduce((sum: number, e: any) => sum + (e.total_pay || 0), 0) || 0,
      };
      exportFileName += ".json";
    } else if (export_type === "adp") {
      // ADP format (simplified)
      exportData = {
        format: "adp",
        payroll_data: payEntries?.map((entry: any) => ({
          employee_id: entry.crew_id,
          employee_name: entry.crew?.name,
          gross_pay: entry.total_pay,
          pay_period_start: pay_period_start,
          pay_period_end: pay_period_end,
        })) || [],
        total_crew_count: new Set(payEntries?.map((e: any) => e.crew_id) || []).size,
        total_pay_amount: payEntries?.reduce((sum: number, e: any) => sum + (e.total_pay || 0), 0) || 0,
      };
      exportFileName += ".json";
    } else {
      // Default JSON format
      exportData = {
        format: "json",
        entries: payEntries || [],
        total_crew_count: new Set(payEntries?.map((e: any) => e.crew_id) || []).size,
        total_pay_amount: payEntries?.reduce((sum: number, e: any) => sum + (e.total_pay || 0), 0) || 0,
      };
      exportFileName += ".json";
    }

    // Create payroll export record
    const { data: exportRecord, error: exportError } = await supabase
      .from("payroll_exports")
      .insert({
        workspace_id,
        export_type,
        export_format: export_format || (export_type === "csv" ? "csv" : "json"),
        pay_period_start,
        pay_period_end,
        export_data: exportData,
        export_file_name: exportFileName,
        crew_ids: crew_ids || payEntries?.map((e: any) => e.crew_id) || [],
        total_crew_count: exportData.total_crew_count,
        total_pay_amount: exportData.total_pay_amount,
        status: "generated",
        created_by: user.id,
      })
      .select()
      .single();

    if (exportError) {
      console.error("Error creating export record:", exportError);
      return NextResponse.json(
        { error: exportError.message || "Failed to create export record" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        export: exportRecord,
        data: exportData,
        file_name: exportFileName,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in payroll export API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































