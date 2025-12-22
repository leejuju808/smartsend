import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;
  const playbookId = params.id;

  // Fetch playbook
  const { data: playbook, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("id", playbookId)
    .single();

  if (error || !playbook) {
    return NextResponse.json(
      { error: "Playbook not found" },
      { status: 404 }
    );
  }

  // Check access: global playbooks are accessible to all, workspace playbooks only to that workspace
  if (!playbook.is_global && playbook.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ playbook });
}








