import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthedClient } from "@/lib/supabase/server";
import { ActivityLogger } from "@/lib/activityLogger";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Auth gate (service role does the write, but only members can trigger it)
    const authed = createAuthedClient();
    const {
      data: { user },
      error: authError,
    } = await authed.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { stage_id } = await req.json();

    if (!stage_id || typeof stage_id !== "string") {
      return NextResponse.json(
        { error: "Stage ID is required" },
        { status: 400 }
      );
    }

    // Load contact (workspace scope + current stage for audit)
    const { data: contact, error: contactError } = await sb
      .from("contacts")
      .select("id, workspace_id, pipeline_stage_id, lead_id")
      .eq("id", params.id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Verify user has access to this workspace
    const { data: member } = await authed
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", contact.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify the stage exists
    const { data: stage, error: stageError } = await sb
      .from("pipeline_stages")
      .select("id,name")
      .eq("id", stage_id)
      .single();

    if (stageError || !stage) {
      return NextResponse.json(
        { error: "Invalid stage ID" },
        { status: 400 }
      );
    }

    let fromStageRow: { id: string; name: string } | null = null;
    if (contact.pipeline_stage_id) {
      const { data } = await sb
        .from("pipeline_stages")
        .select("id,name")
        .eq("id", contact.pipeline_stage_id)
        .maybeSingle();
      fromStageRow = (data as any) ?? null;
    }

    // Update the contact's pipeline stage
    const { error: updateError } = await sb
      .from("contacts")
      .update({ pipeline_stage_id: stage_id })
      .eq("id", params.id);

    if (updateError) {
      console.error("Error updating contact:", updateError);
      return NextResponse.json(
        { error: "Failed to update contact" },
        { status: 500 }
      );
    }

    // Best-effort audit: log movement (no owner names surfaced in UI)
    await ActivityLogger.logPipelineMoved(contact.workspace_id, {
      userId: user.id,
      contactId: contact.id,
      leadId: (contact as any).lead_id ?? undefined,
      fromStage: fromStageRow?.name ?? undefined,
      toStage: (stage as any).name ?? "Unknown",
      reason: "manual_move",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 