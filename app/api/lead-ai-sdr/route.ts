import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lead_id, opt_out, reason } = body as {
      lead_id: string;
      opt_out: boolean;
      reason?: string;
    };

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id required" },
        { status: 400 },
      );
    }

    const supabase = createClient();

    const nowIso = new Date().toISOString();

    const update = {
      ai_sdr_opt_out: opt_out,
      ai_sdr_opt_out_reason: opt_out ? reason || null : null,
      ai_sdr_opt_out_at: opt_out ? nowIso : null,
    };

    const { data: lead, error: updateError } = await supabase
      .from("leads")
      .update(update)
      .eq("id", lead_id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "update_failed", details: updateError },
        { status: 500 },
      );
    }

    // Log as guardrail event
    await supabase.from("sdr_guardrail_events").insert({
      org_id: lead.org_id || null,
      lead_id,
      email_domain: lead.email ? lead.email.split("@")[1] : null,
      guardrail_type: opt_out ? "manual_lead_opt_out" : "manual_lead_opt_in",
      message: opt_out
        ? "AI SDR manually disabled for this lead"
        : "AI SDR manually re-enabled for this lead",
      context: {
        reason: reason || null,
      },
    });

    return NextResponse.json({ lead });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

