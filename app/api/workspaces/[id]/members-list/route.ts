import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is a member of this workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "Not a member of this workspace" },
      { status: 403 }
    );
  }

  // Get all workspace members with user info
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select(`
      user_id,
      role,
      profiles:user_id (
        email,
        full_name
      )
    `)
    .eq("workspace_id", params.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // Transform to include email/name
  const membersList = (members || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || m.profiles?.email || m.user_id.substring(0, 8),
    email: m.profiles?.email,
    role: m.role,
  }));

  return NextResponse.json({ members: membersList });
}








