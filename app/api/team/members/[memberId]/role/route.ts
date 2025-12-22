// app/api/team/members/[memberId]/role/route.ts
// Block 265: Update team member role

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { enforceRole } from "@/lib/middleware/enforceRole";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { role } = await req.json();

    if (!role || !['owner', 'admin', 'member', 'read_only'].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Get the member being updated
    const { data: targetMember, error: memberError } = await supabaseAdmin
      .from("team_members")
      .select("workspace_id, role, user_id")
      .eq("id", params.memberId)
      .single();

    if (memberError || !targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Check permissions: only owner/admin can change roles
    const authCheck = await enforceRole(["owner", "admin"], targetMember.workspace_id);
    if ("error" in authCheck) {
      return authCheck.error;
    }

    // Cannot change owner role (except to another owner, but that's handled separately)
    if (targetMember.role === "owner" && role !== "owner") {
      // Check if this is the only owner
      const { count } = await supabaseAdmin
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", targetMember.workspace_id)
        .eq("role", "owner")
        .eq("status", "active");

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot demote the only owner" },
          { status: 400 }
        );
      }
    }

    // Only owner can assign owner role
    if (role === "owner" && authCheck.member.role !== "owner") {
      return NextResponse.json(
        { error: "Only owners can assign owner role" },
        { status: 403 }
      );
    }

    // Cannot change your own role if you're the only owner/admin
    if (targetMember.user_id === user.id && targetMember.role === "owner" && role !== "owner") {
      const { count } = await supabaseAdmin
        .from("team_members")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", targetMember.workspace_id)
        .eq("role", "owner")
        .eq("status", "active");

      if ((count || 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot change your own role if you're the only owner" },
          { status: 400 }
        );
      }
    }

    // Update the role
    const { error: updateError } = await supabaseAdmin
      .from("team_members")
      .update({ role })
      .eq("id", params.memberId);

    if (updateError) {
      console.error("Error updating member role:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error updating member role:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









