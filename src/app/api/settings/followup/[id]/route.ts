import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";

/**
 * GET /api/settings/followup/[id]
 * Get a specific follow-up rule
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const { data: rule, error } = await supabase
      .from("follow_up_rules")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({ data: rule });
  } catch (error: any) {
    console.error("Error fetching follow-up rule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings/followup/[id]
 * Update a follow-up rule
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Block 273000 — AUTOPILOT: follow-up settings are locked when autopilot is ON.
    const workspaceId = await getActiveWorkspaceId().catch(() => null);
    if (workspaceId) {
      const gate = await blockIfAutopilotEnabled({
        req,
        workspaceId,
        action: "Follow-up rule updates",
      });
      if (gate.blocked) return gate.response;
    }

    const { id } = await params;
    const body = await req.json();

    // BLOCK 269600 — SmartSend Enforcement Sprint:
    // Follow-ups cannot be disabled. Force active=true and ignore attempts to turn it off.
    if ("active" in body) {
      body.active = true;
    }

    // Validate trigger_type if provided
    if (body.trigger_type && !["no_reply", "warm_intent", "hot_intent", "reply_then_silent"].includes(body.trigger_type)) {
      return NextResponse.json(
        { error: "Invalid trigger_type" },
        { status: 400 }
      );
    }

    // Validate action_type if provided
    if (body.action_type && !["send_email_step", "create_task", "add_tag", "stop_sequence"].includes(body.action_type)) {
      return NextResponse.json(
        { error: "Invalid action_type" },
        { status: 400 }
      );
    }

    const { data: rule, error } = await supabase
      .from("follow_up_rules")
      .update(body)
      .eq("id", id)
      .eq("org_id", org.id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!rule) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({ data: rule });
  } catch (error: any) {
    console.error("Error updating follow-up rule:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settings/followup/[id]
 * Delete a follow-up rule
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // BLOCK 269600 — SmartSend Enforcement Sprint:
  // Follow-ups are mandatory and cannot be deleted.
  return NextResponse.json(
    { error: "Follow-ups are mandatory and cannot be deleted." },
    { status: 403 }
  );
}



























































