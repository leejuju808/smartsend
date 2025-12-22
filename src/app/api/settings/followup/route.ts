import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";

/**
 * GET /api/settings/followup
 * List all follow-up rules for the current organization
 */
export async function GET(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rules, error } = await supabase
      .from("follow_up_rules")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: rules });
  } catch (error: any) {
    console.error("Error fetching follow-up rules:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/followup
 * Create a new follow-up rule
 */
export async function POST(req: NextRequest) {
  try {
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (workspaceId) {
      // Enforce: when AUTOPILOT is enabled for the active workspace, follow-up rules are locked.
      const autopilotGate = await blockIfAutopilotEnabled({
        req,
        workspaceId,
        action: "Follow-up settings",
      });
      if (autopilotGate.blocked) return autopilotGate.response;
    }

    const body = await req.json();
    const {
      trigger_type,
      condition_days,
      step_id,
      campaign_id,
      action_type,
      action_value,
      delay_hours,
      name,
      description,
      active,
    } = body;

    // Validate required fields
    if (!trigger_type || !action_type) {
      return NextResponse.json(
        { error: "trigger_type and action_type are required" },
        { status: 400 }
      );
    }

    // Validate trigger_type
    if (
      !["no_reply", "warm_intent", "hot_intent", "reply_then_silent"].includes(
        trigger_type
      )
    ) {
      return NextResponse.json(
        { error: "Invalid trigger_type" },
        { status: 400 }
      );
    }

    // Validate action_type
    if (
      !["send_email_step", "create_task", "add_tag", "stop_sequence"].includes(
        action_type
      )
    ) {
      return NextResponse.json(
        { error: "Invalid action_type" },
        { status: 400 }
      );
    }

    const { data: rule, error } = await supabase
      .from("follow_up_rules")
      .insert({
        org_id: org.id,
        trigger_type,
        condition_days: condition_days || null,
        step_id: step_id || null,
        campaign_id: campaign_id || null,
        action_type,
        action_value: action_value || null,
        delay_hours: delay_hours || 0,
        name: name || null,
        description: description || null,
        // BLOCK 269600 — SmartSend Enforcement Sprint:
        // Follow-ups are mandatory by design. Do not allow disabling at creation time.
        active: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating follow-up rule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























































