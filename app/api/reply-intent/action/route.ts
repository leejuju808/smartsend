import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      lead_id,
      reply_id,
      action_type,
      pipeline_stage,
    } = body as {
      lead_id: string;
      reply_id?: string;
      action_type:
        | "move_stage"
        | "mark_not_interested"
        | "mark_disqualified"
        | "move_to_nurture"
        | "move_to_hold";
      pipeline_stage?: string;
    };

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id_required" },
        { status: 400 },
      );
    }

    const supabase = createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Load lead so we know the previous stage
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, pipeline_stage")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json(
        { error: "lead_not_found", details: leadErr },
        { status: 404 },
      );
    }

    let newStage: string | null = null;
    let eventLabel: string;

    switch (action_type) {
      case "move_stage":
        if (!pipeline_stage) {
          return NextResponse.json(
            { error: "pipeline_stage_required_for_move_stage" },
            { status: 400 },
          );
        }
        newStage = pipeline_stage;
        eventLabel = `Pipeline updated via quick action → ${pipeline_stage}`;
        break;

      case "mark_not_interested":
        newStage = "closed_lost";
        eventLabel = "Lead marked not interested via quick action";
        break;

      case "mark_disqualified":
        newStage = "disqualified";
        eventLabel = "Lead disqualified via quick action";
        break;

      case "move_to_nurture":
        newStage = "nurture";
        eventLabel = "Lead moved to nurture via quick action";
        break;

      case "move_to_hold":
        newStage = "hold";
        eventLabel = "Lead moved to hold via quick action";
        break;

      default:
        return NextResponse.json(
          { error: "unknown_action_type" },
          { status: 400 },
        );
    }

    // 2) Update pipeline_stage
    const { error: updateErr } = await supabase
      .from("leads")
      .update({
        pipeline_stage: newStage,
      })
      .eq("id", lead_id);

    if (updateErr) {
      return NextResponse.json(
        { error: "update_failed", details: updateErr },
        { status: 500 },
      );
    }

    // 3) Log into lead_activity_events
    await supabase.from("lead_activity_events").insert({
      lead_id,
      event_type: "pipeline_changed",
      source: "ai_sdr_quick_action",
      payload: {
        from: lead.pipeline_stage,
        to: newStage,
        reply_id: reply_id ?? null,
        action_type,
      },
      message: eventLabel,
    });

    return NextResponse.json({ ok: true, pipeline_stage: newStage });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

