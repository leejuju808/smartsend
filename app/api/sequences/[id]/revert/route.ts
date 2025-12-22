import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireEditor } from "@/lib/permissions/campaign";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { versionId, campaignId } = await req.json();

  if (!versionId) {
    return NextResponse.json(
      { error: "versionId is required" },
      { status: 400 }
    );
  }

  // Get sequence to find campaign_id if not provided
  const { data: sequence } = await supabase
    .from("sequences")
    .select("campaign_id")
    .eq("id", params.id)
    .single();

  const effectiveCampaignId = campaignId || sequence?.campaign_id;

  // Permissions check - require editor if campaign exists
  if (effectiveCampaignId) {
    const check = await requireEditor(effectiveCampaignId);
    if (!check.allowed) {
      return check.response;
    }
  } else {
    // If no campaign, check sequence ownership via workspace
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: seq } = await supabase
      .from("sequences")
      .select("workspace_id")
      .eq("id", params.id)
      .single();

    if (!seq || seq.workspace_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Get snapshot to restore
  const { data: version, error: versionError } = await supabase
    .from("sequence_versions")
    .select("snapshot")
    .eq("id", versionId)
    .eq("sequence_id", params.id)
    .single();

  if (versionError || !version) {
    return NextResponse.json(
      { error: "Version not found" },
      { status: 404 }
    );
  }

  const snapshot = version.snapshot as any;

  if (!snapshot || !snapshot.sequence) {
    return NextResponse.json(
      { error: "Invalid snapshot data" },
      { status: 400 }
    );
  }

  // Restore sequence fields (excluding id, created_at, etc.)
  const { sequence: seqData, steps } = snapshot;

  const sequenceUpdate: any = {};
  if (seqData.name !== undefined) sequenceUpdate.name = seqData.name;
  if (seqData.status !== undefined) sequenceUpdate.status = seqData.status;
  if (seqData.campaign_id !== undefined)
    sequenceUpdate.campaign_id = seqData.campaign_id;
  if (seqData.workspace_id !== undefined)
    sequenceUpdate.workspace_id = seqData.workspace_id;
  if (seqData.timezone !== undefined) sequenceUpdate.timezone = seqData.timezone;
  if (seqData.stop_on_reply !== undefined)
    sequenceUpdate.stop_on_reply = seqData.stop_on_reply;
  if (seqData.send_window !== undefined)
    sequenceUpdate.send_window = seqData.send_window;
  if (seqData.throttle_per_tick !== undefined)
    sequenceUpdate.throttle_per_tick = seqData.throttle_per_tick;

  const { error: updateError } = await supabase
    .from("sequences")
    .update(sequenceUpdate)
    .eq("id", params.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Restore steps
  if (Array.isArray(steps)) {
    // Delete existing steps
    await supabase.from("sequence_steps").delete().eq("sequence_id", params.id);

    // Insert restored steps
    if (steps.length > 0) {
      const stepsToInsert = steps.map((step: any) => {
        const { id, sequence_id, ...stepData } = step;
        return {
          ...stepData,
          sequence_id: params.id,
        };
      });

      const { error: stepsError } = await supabase
        .from("sequence_steps")
        .insert(stepsToInsert);

      if (stepsError) {
        return NextResponse.json(
          { error: stepsError.message },
          { status: 500 }
        );
      }
    }
  }

  // Log this revert as a new version
  const user = (await supabase.auth.getUser()).data.user;
  if (user) {
    const { logSequenceVersion } = await import(
      "@/lib/sequences/version-logger"
    );
    await logSequenceVersion(
      params.id,
      effectiveCampaignId,
      user.id,
      "revert"
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}








