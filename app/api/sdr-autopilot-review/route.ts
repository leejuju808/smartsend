import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { job_id, action, subject, body: content } = body as {
      job_id: string;
      action: "approve" | "skip";
      subject?: string;
      body?: string;
    };

    if (!job_id || !action) {
      return NextResponse.json(
        { error: "job_id and action are required" },
        { status: 400 },
      );
    }

    const supabase = createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: job, error: jobError } = await supabase
      .from("sdr_autopilot_queue")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "job_not_found", details: jobError },
        { status: 404 },
      );
    }

    if (job.review_status !== "pending_review") {
      return NextResponse.json(
        { error: "not_in_review_state" },
        { status: 400 },
      );
    }

    if (action === "skip") {
      const { error: updateError } = await supabase
        .from("sdr_autopilot_queue")
        .update({
          review_status: "skipped",
          status: "cancelled",
          approved_at: new Date().toISOString(),
          // approved_by: user.id, // TODO: wire auth when you add approved_by column reference
        })
        .eq("id", job_id);

      if (updateError) {
        return NextResponse.json(
          { error: "update_failed", details: updateError },
          { status: 500 },
        );
      }

      // Log activity
      await supabase.from("lead_activity_events").insert({
        lead_id: job.lead_id,
        event_type: "autopilot_skipped",
        source: "ai_sdr",
        related_table: "sdr_autopilot_queue",
        related_id: job.id,
        payload: {
          reason: "human_skipped",
        },
      });

      return NextResponse.json({ status: "skipped" });
    }

    // action === "approve"
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("sdr_autopilot_queue")
      .update({
        review_status: "approved",
        approved_at: nowIso,
        edited_subject: subject ?? null,
        edited_body: content ?? null,
        // approved_by: user.id, // TODO: wire auth when you add approved_by column reference
      })
      .eq("id", job_id);

    if (updateError) {
      return NextResponse.json(
        { error: "update_failed", details: updateError },
        { status: 500 },
      );
    }

    await supabase.from("lead_activity_events").insert({
      lead_id: job.lead_id,
      event_type: "autopilot_approved",
      source: "ai_sdr",
      related_table: "sdr_autopilot_queue",
      related_id: job.id,
      payload: {
        approved_at: nowIso,
      },
    });

    return NextResponse.json({ status: "approved" });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

