import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return Response.json({ error: "not_auth" }, { status: 401 });

  const { draftType, entityId, content } = await req.json();

  if (!draftType) {
    return Response.json({ error: "draft_type_required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Build the draft record
  const draftRecord: any = {
    workspace_id: workspaceId,
    user_id: user.id,
    draft_type: draftType,
    content,
  };

  if (entityId) {
    draftRecord.entity_id = entityId;
  }

  // Find existing draft first
  let existingQuery = supabase
    .from("drafts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("draft_type", draftType);

  if (entityId) {
    existingQuery = existingQuery.eq("entity_id", entityId);
  } else {
    existingQuery = existingQuery.is("entity_id", null);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    // Update existing draft
    const { data: updated, error: updateError } = await supabase
      .from("drafts")
      .update({
        content,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) return Response.json({ error: updateError }, { status: 400 });
    return Response.json({ draft: updated }, { status: 200 });
  } else {
    // Insert new draft
    const { data: inserted, error: insertError } = await supabase
      .from("drafts")
      .insert(draftRecord)
      .select()
      .single();

    if (insertError) return Response.json({ error: insertError }, { status: 400 });
    return Response.json({ draft: inserted }, { status: 200 });
  }
}

