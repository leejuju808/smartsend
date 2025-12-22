// Block 256900 — Payroll & Timekeeping Engine v1
// GET /api/workforce/payroll/missed-punches
// POST /api/workforce/payroll/missed-punches/resolve
// Manage missed punch alerts

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
    const company_id = searchParams.get("company_id");
    const status = searchParams.get("status") || "active";
    const employee_id = searchParams.get("employee_id");

    let query = supabase
      .from("missed_punch_alerts")
      .select(
        `
        *,
        employee:workforce_employees(id, first_name, last_name),
        time_entry:time_entries(*)
      `
      )
      .eq("status", status)
      .order("created_at", { ascending: false });

    if (company_id) {
      query = query.eq("company_id", company_id);
    }

    if (employee_id) {
      query = query.eq("employee_id", employee_id);
    }

    const { data: alerts, error } = await query;

    if (error) {
      console.error("Error fetching missed punch alerts:", error);
      return NextResponse.json(
        { error: "Failed to fetch alerts", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      alerts: alerts || [],
      count: alerts?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in missed punches API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { alert_id, action, corrected_clock_out, resolution_notes } = body;

    if (!alert_id || !action) {
      return NextResponse.json(
        { error: "alert_id and action are required" },
        { status: 400 }
      );
    }

    if (!["resolve", "dismiss"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'resolve' or 'dismiss'" },
        { status: 400 }
      );
    }

    // Get alert
    const { data: alert, error: alertError } = await supabase
      .from("missed_punch_alerts")
      .select("*")
      .eq("id", alert_id)
      .single();

    if (alertError || !alert) {
      return NextResponse.json(
        { error: "Alert not found" },
        { status: 404 }
      );
    }

    // Update alert
    const updateData: any = {
      status: action === "resolve" ? "resolved" : "dismissed",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (resolution_notes) {
      updateData.resolution_notes = resolution_notes;
    }

    if (corrected_clock_out) {
      updateData.corrected_clock_out = corrected_clock_out;
    }

    const { data: updatedAlert, error: updateError } = await supabase
      .from("missed_punch_alerts")
      .update(updateData)
      .eq("id", alert_id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Error updating alert:", updateError);
      return NextResponse.json(
        { error: "Failed to update alert", details: updateError.message },
        { status: 500 }
      );
    }

    // If resolving with corrected clock-out, update time entry
    if (action === "resolve" && corrected_clock_out && alert.time_entry_id) {
      await supabase
        .from("time_entries")
        .update({
          clock_out: corrected_clock_out,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alert.time_entry_id);
    }

    return NextResponse.json({
      success: true,
      message: `Alert ${action}d successfully`,
      alert: updatedAlert,
    });
  } catch (error: any) {
    console.error("Error in missed punches API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















