import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Try to get team members from workspace_members first
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membership) {
    const { data: members, error: membersError } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", membership.workspace_id);

    if (!membersError && members) {
      const userIds = members.map((m) => m.user_id).filter(Boolean);
      
      // Fetch user emails using service role client
      const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const teamMembers = [];
      for (const userId of userIds) {
        if (userId === user.id) continue; // Skip self
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          if (authUser?.user?.email) {
            teamMembers.push({
              id: userId,
              email: authUser.user.email,
            });
          }
        } catch (e) {
          // Skip if user not found
        }
      }

      return NextResponse.json(teamMembers);
    }
  }

  // Fallback: try team_members table
  const { data: teamMember } = await supabase
    .from("team_members")
    .select("account_id")
    .eq("user_id", user.id)
    .single();

  if (teamMember) {
    const { data: members, error: membersError } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("account_id", teamMember.account_id);

    if (!membersError && members) {
      const userIds = members.map((m) => m.user_id).filter(Boolean);
      
      // Fetch user emails using service role client
      const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
      );

      const teamMembers = [];
      for (const userId of userIds) {
        if (userId === user.id) continue; // Skip self
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          if (authUser?.user?.email) {
            teamMembers.push({
              id: userId,
              email: authUser.user.email,
            });
          }
        } catch (e) {
          // Skip if user not found
        }
      }

      return NextResponse.json(teamMembers);
    }
  }

  return NextResponse.json([]);
}










