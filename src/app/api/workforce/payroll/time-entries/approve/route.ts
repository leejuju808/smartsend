// Block 256900 — Payroll & Timekeeping Engine v1
// POST /api/workforce/payroll/time-entries/approve
// Approve time entries (timesheet approval workflow)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      time_entry_ids,
      action, // 'approve' or 'reject'
      rejection_reason,
      notes,
    } = body;

    if (!time_entry_ids || !Array.isArray(time_entry_ids) || time_entry_ids.length === 0) {
      return NextResponse.json(
        { error: "time_entry_ids array is required" },
        { status: 400 }
      );
    }

    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve' or 'reject'" },
        { status: 400 }
      );
    }

    // Verify user has permission to approve (company member)
    const { data: firstEntry } = await supabase
      .from("time_entries")
      .select("company_id")
      .eq("id", time_entry_ids[0])
      .single();

    if (!firstEntry) {
      return NextResponse.json(
        { error: "Time entry not found" },
        { status: 404 }
      );
    }

    // Update time entries
    const updateData: any = {
      status: action === "approve" ? "approved" : "rejected",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (action === "reject" && rejection_reason) {
      updateData.rejection_reason = rejection_reason;
    }

    if (notes) {
      updateData.notes = notes;
    }

    const { data: updatedEntries, error: updateError } = await supabase
      .from("time_entries")
      .update(updateData)
      .in("id", time_entry_ids)
      .select("*");

    if (updateError) {
      console.error("Approval error:", updateError);
      return NextResponse.json(
        { error: "Failed to update time entries", details: updateError.message },
        { status: 500 }
      );
    }

    // Sync labor to job cost for approved entries
    if (action === "approve") {
      for (const entry of updatedEntries || []) {
        if (entry.clock_out && entry.job_id) {
          await supabase.rpc("sync_labor_to_job_cost", {
            p_time_entry_id: entry.id,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Time entries ${action}d successfully`,
      entries: updatedEntries,
      count: updatedEntries?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in approval API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















