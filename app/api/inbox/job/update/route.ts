// Block 20070 — Job Value Update Endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      conversation_id,
      estimated_job_value,
      actual_job_value,
      is_insurance_claim,
      insurance_carrier,
      mark_closed_won,
    } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id is required" },
        { status: 400 }
      );
    }

    const patch: any = {};

    if (typeof estimated_job_value === "number") {
      patch.estimated_job_value = estimated_job_value;
    }

    if (typeof actual_job_value === "number") {
      patch.actual_job_value = actual_job_value;
    }

    if (typeof is_insurance_claim === "boolean") {
      patch.is_insurance_claim = is_insurance_claim;
    }

    if (typeof insurance_carrier === "string") {
      patch.insurance_carrier = insurance_carrier;
    }

    if (mark_closed_won) {
      patch.lead_stage = "won";
      patch.close_date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    }

    const { data, error } = await supabase
      .from("inbox_threads")
      .update(patch)
      .eq("id", conversation_id)
      .select()
      .single();

    if (error) {
      console.error("Job update error", error);
      return NextResponse.json(
        { error: "Failed to update job" },
        { status: 500 }
      );
    }

    return NextResponse.json({ conversation: data });
  } catch (error: any) {
    console.error("Error in /api/inbox/job/update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

















































