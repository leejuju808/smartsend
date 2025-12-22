import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { member_id } = await req.json();

    if (!member_id) {
      return NextResponse.json({ error: "member_id is required" }, { status: 400 });
    }

    // Get the team member to verify workspace and permissions
    const { data: teamMember, error: memberError } = await supabaseAdmin
      .from("team_members")
      .select("workspace_id, role")
      .eq("id", member_id)
      .single();

    if (memberError || !teamMember) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    // Verify user has permission (owner/admin of the workspace)
    const { data: currentMember } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("workspace_id", teamMember.workspace_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!currentMember || !['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Prevent removing the last owner
    if (teamMember.role === 'owner') {
      const { count } = await supabaseAdmin
        .from("team_members")
        .select("*", { count: 'exact', head: true })
        .eq("workspace_id", teamMember.workspace_id)
        .eq("role", "owner")
        .eq("status", "active");

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner" },
          { status: 400 }
        );
      }
    }

    // Delete the team member
    const { error: deleteError } = await supabaseAdmin
      .from("team_members")
      .delete()
      .eq("id", member_id);

    if (deleteError) {
      console.error("Error removing team member:", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    // Decrement seat count (trigger will handle this automatically)
    // Optionally call the function to ensure it's updated immediately
    try {
      await supabaseAdmin.rpc("refresh_workspace_seats_from_team_members", { _ws: teamMember.workspace_id });
    } catch (err) {
      // Function might not exist yet, trigger will handle it
      console.log("Seat refresh function not available, trigger will handle it");
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error removing team member:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

