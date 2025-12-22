// Block 24220 — SmartSend Quote Follow-Up Insurance Status Handler
// Updates insurance status for quote follow-up sequences

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      quote_id,
      waiting_on_insurance,
      adjuster_scheduled,
      adjuster_date,
    } = body;

    if (!quote_id) {
      return NextResponse.json(
        { error: "quote_id required" },
        { status: 400 }
      );
    }

    // Call database function to update insurance status
    const { error } = await supabase.rpc("update_quote_insurance_status", {
      p_quote_id: quote_id,
      p_waiting_on_insurance: waiting_on_insurance ?? null,
      p_adjuster_scheduled: adjuster_scheduled ?? null,
      p_adjuster_date: adjuster_date ?? null,
    });

    if (error) {
      console.error("Insurance status handler error:", error);
      return NextResponse.json(
        { error: "Failed to update insurance status" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Insurance status updated successfully",
    });
  } catch (error: any) {
    console.error("Insurance status API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































