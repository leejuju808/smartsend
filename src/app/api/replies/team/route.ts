import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
  try {
    const supabase = getServerSupabase();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspaces
    const { data: workspaceMembers, error: workspaceError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (workspaceError) {
      return NextResponse.json({ error: workspaceError.message }, { status: 400 });
    }

    // If user has workspaces, get all members from those workspaces
    if (workspaceMembers && workspaceMembers.length > 0) {
      const workspaceIds = workspaceMembers.map((wm) => wm.workspace_id);
      const { data: allMembers, error: membersError } = await supabase
        .from("workspace_members")
        .select(`
          user_id,
          profiles (
            id,
            email,
            full_name
          )
        `)
        .in("workspace_id", workspaceIds);

      if (membersError) {
        return NextResponse.json({ error: membersError.message }, { status: 400 });
      }

      // Map to unique team members
      const uniqueMembers = new Map();
      (allMembers || []).forEach((member: any) => {
        if (member.profiles && !uniqueMembers.has(member.user_id)) {
          uniqueMembers.set(member.user_id, {
            id: member.user_id,
            email: member.profiles.email,
            name: member.profiles.full_name || member.user_id,
          });
        }
      });

      return NextResponse.json({ members: Array.from(uniqueMembers.values()) });
    }

    // Fallback: get profiles (adjust to your teams model)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name");

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 });
    }

    const mapped = (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      name: p.full_name ?? p.id,
    }));

    return NextResponse.json({ members: mapped });
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: error?.message ?? "Unexpected error" } },
      { status: 500 }
    );
  }
}

