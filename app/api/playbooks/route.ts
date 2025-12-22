import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
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

  // Fetch global playbooks and workspace-specific playbooks
  const { data: playbooks, error } = await supabase
    .from("playbooks")
    .select("*")
    .or(`is_global.eq.true,workspace_id.eq.${workspaceId}`)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching playbooks:", error);
    return NextResponse.json(
      { error: "Failed to fetch playbooks" },
      { status: 500 }
    );
  }

  return NextResponse.json({ playbooks: playbooks || [] });
}








