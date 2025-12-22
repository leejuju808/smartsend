import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/follow-up/rules
 * Create/update individual rules
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      id,
      program_id,
      type,
      is_enabled,
      priority,
      no_reply_after_days,
      follow_up_template_id,
      intent_match_any,
      pipeline_stage_from,
      pipeline_stage_to,
      min_lead_score,
      max_lead_score,
      stop_all_future,
      add_to_suppression,
    } = body;

    if (!program_id || !type) {
      return NextResponse.json(
        { error: "Missing required fields: program_id, type" },
        { status: 400 }
      );
    }

    // Verify program belongs to user
    const { data: program } = await supabase
      .from("follow_up_programs")
      .select("id, account_id")
      .eq("id", program_id)
      .eq("account_id", user.id)
      .single();

    if (!program) {
      return NextResponse.json(
        { error: "Program not found or access denied" },
        { status: 404 }
      );
    }

    const ruleData: any = {
      program_id,
      account_id: user.id,
      type,
      is_enabled: is_enabled !== undefined ? is_enabled : true,
      priority: priority || 100,
      stop_all_future: stop_all_future || false,
      add_to_suppression: add_to_suppression || false,
    };

    // Set type-specific fields
    if (type === "no_reply") {
      ruleData.no_reply_after_days = no_reply_after_days;
      ruleData.follow_up_template_id = follow_up_template_id;
    } else if (type === "positive_intent" || type === "negative_intent") {
      ruleData.intent_match_any = intent_match_any || [];
    } else if (type === "pipeline_stage") {
      ruleData.pipeline_stage_from = pipeline_stage_from;
      ruleData.pipeline_stage_to = pipeline_stage_to;
    } else if (type === "lead_score") {
      ruleData.min_lead_score = min_lead_score;
      ruleData.max_lead_score = max_lead_score;
    }

    let result;
    if (id) {
      // Update existing rule
      const { data, error } = await supabase
        .from("follow_up_rules")
        .update(ruleData)
        .eq("id", id)
        .eq("account_id", user.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to update rule" },
          { status: 500 }
        );
      }

      result = data;
    } else {
      // Create new rule
      const { data, error } = await supabase
        .from("follow_up_rules")
        .insert(ruleData)
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          { error: "Failed to create rule" },
          { status: 500 }
        );
      }

      result = data;
    }

    return NextResponse.json({ rule: result });
  } catch (error) {
    console.error("Error saving follow-up rule:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/follow-up/rules?id=...
 * Delete a rule
 */
export async function DELETE(req: NextRequest) {
  const supabase = createClient();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing rule id" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("follow_up_rules")
      .delete()
      .eq("id", id)
      .eq("account_id", user.id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to delete rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting follow-up rule:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
























































