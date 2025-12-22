// Block 253700 — Crew Payroll Engine v1
// GET /api/workforce/payroll/approvals - Get approval summaries
// POST /api/workforce/payroll/approvals - Approve timecards

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompanyId } from "@/lib/company-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("job_id");
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get approval summary
    const { data: summary, error } = await supabase.rpc(
      "get_supervisor_approval_summary",
      {
        p_job_id: jobId,
        p_date: date,
      }
    );

    if (error) {
      console.error("Error fetching approval summary:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ summary: summary || [] });
  } catch (error: any) {
    console.error("Error in approvals GET API:", error);
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

    const companyId = await getCurrentCompanyId();
    if (!companyId) {
      return NextResponse.json({ error: "No company found" }, { status: 400 });
    }

    const body = await req.json();
    const { job_id, date, timecard_ids, notes } = body;

    if (!job_id || !date || !timecard_ids || !Array.isArray(timecard_ids)) {
      return NextResponse.json(
        { error: "job_id, date, and timecard_ids array are required" },
        { status: 400 }
      );
    }

    // Approve timecards
    const { data: approvalId, error } = await supabase.rpc("approve_timecards", {
      p_job_id: job_id,
      p_date: date,
      p_supervisor_id: user.id,
      p_timecard_ids: timecard_ids,
      p_notes: notes || null,
    });

    if (error) {
      console.error("Error approving timecards:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ approval_id: approvalId }, { status: 201 });
  } catch (error: any) {
    console.error("Error in approvals POST API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























