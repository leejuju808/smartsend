import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;

  if (!user) return Response.json({ error: "not_auth" }, { status: 401 });

  const url = new URL(req.url);
  const draftType = url.searchParams.get("type");
  const entityId = url.searchParams.get("entityId");

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

  let query = supabase
    .from("drafts")
    .select("*")
    .eq("workspace_id", membership.workspace_id)
    .eq("user_id", user.id)
    .eq("draft_type", draftType);

  if (entityId) {
    query = query.eq("entity_id", entityId);
  } else {
    query = query.is("entity_id", null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) return Response.json({ error }, { status: 400 });

  return Response.json({ draft: data }, { status: 200 });
}







