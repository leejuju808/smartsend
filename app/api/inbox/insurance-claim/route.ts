// Block 20250 — Insurance Claim Update API

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      conversation_id,
      is_insurance_claim,
      insurance_carrier,
      insurance_claim_number,
      insurance_adjuster_name,
      insurance_adjuster_phone,
      insurance_adjuster_email,
      insurance_deductible,
      insurance_status,
      insurance_notes,
    } = body;

    if (!conversation_id) {
      return NextResponse.json(
        { error: "conversation_id required" },
        { status: 400 }
      );
    }

    // 1) Load current thread to get campaign_id
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("id", conversation_id)
      .single();

    if (threadError || !thread) {
      console.error("Insurance claim thread error", threadError);
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // 2) Update conversation with insurance claim data
    const updatePayload: any = {
      is_insurance_claim: is_insurance_claim !== undefined ? !!is_insurance_claim : null,
      insurance_carrier: insurance_carrier || null,
      insurance_claim_number: insurance_claim_number || null,
      insurance_adjuster_name: insurance_adjuster_name || null,
      insurance_adjuster_phone: insurance_adjuster_phone || null,
      insurance_adjuster_email: insurance_adjuster_email || null,
      insurance_status: insurance_status || null,
      insurance_notes: insurance_notes || null,
    };

    if (insurance_deductible !== undefined && insurance_deductible !== null) {
      updatePayload.insurance_deductible = Number(insurance_deductible);
    } else {
      updatePayload.insurance_deductible = null;
    }

    const { data: updatedThread, error: updateError } = await supabase
      .from("inbox_threads")
      .update(updatePayload)
      .eq("id", conversation_id)
      .select()
      .single();

    if (updateError) {
      console.error("Insurance claim update error", updateError);
      return NextResponse.json(
        { error: "Failed to update insurance info" },
        { status: 500 }
      );
    }

    // 3) Log into activity timeline
    const { error: logError } = await supabase.from("inbox_activity_log").insert({
      thread_id: conversation_id,
      campaign_id: thread.campaign_id,
      user_id: user.id,
      type: "insurance",
      title: "Insurance claim updated",
      body: insurance_notes || null,
      meta: {
        insurance_carrier,
        insurance_claim_number,
        insurance_status,
        insurance_deductible:
          insurance_deductible !== undefined && insurance_deductible !== null
            ? Number(insurance_deductible)
            : null,
      },
    });

    if (logError) {
      console.error("Insurance activity error", logError);
      // not fatal for API consumer
    }

    return NextResponse.json({ conversation: updatedThread });
  } catch (error: any) {
    console.error("Error in insurance-claim route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}


