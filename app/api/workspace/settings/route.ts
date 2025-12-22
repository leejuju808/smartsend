// app/api/workspace/settings/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type SettingsPatch = {
  booking_link?: string | null;
};

export async function GET() {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, booking_link")
    .eq("id", membership.workspace_id)
    .single();

  if (wsErr || !workspace) {
    return Response.json({ error: "workspace_not_found" }, { status: 404 });
  }

  return Response.json(
    {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        booking_link: workspace.booking_link,
      },
    },
    { status: 200 }
  );
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  // Optional: restrict update to admin/owner roles
  // if (membership.role !== "owner" && membership.role !== "admin") {
  //   return Response.json({ error: "forbidden" }, { status: 403 });
  // }

  let body: SettingsPatch;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const patch: any = {};
  if (body.booking_link !== undefined) {
    patch.booking_link = body.booking_link || null;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const { data: updated, error: upErr } = await supabase
    .from("workspaces")
    .update(patch)
    .eq("id", membership.workspace_id)
    .select("id, name, booking_link")
    .single();

  if (upErr) {
    console.error("[workspace.settings] update error", upErr);
    return Response.json({ error: "update_failed" }, { status: 500 });
  }

  return Response.json({ workspace: updated }, { status: 200 });
}




