import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole } from "@/lib/auth/requireAccountRole";

// PATCH /api/settings/team/change-role - Change a team member's role
export async function PATCH(req: NextRequest) {
  try {
    // Only owners can change roles
    const gate = await requireAccountRole(["owner"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { error: "User ID and role are required" },
        { status: 400 }
      );
    }

    if (!["owner", "manager", "staff"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'owner', 'manager', or 'staff'" },
        { status: 400 }
      );
    }

    const { roleData } = gate;
    const accountId = roleData.account_id;

    // Get the user to update
    const { data: userToUpdate } = await supabase
      .from("users")
      .select("id, role, auth_user_id")
      .eq("id", userId)
      .eq("account_id", accountId)
      .single();

    if (!userToUpdate) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Prevent changing owner role if user is the account owner
    if (userToUpdate.auth_user_id === roleData.user_id && roleData.is_account_owner) {
      return NextResponse.json(
        { error: "Cannot change role of account owner" },
        { status: 400 }
      );
    }

    // Prevent setting role to 'owner' if there's already an owner
    if (role === "owner") {
      const { data: existingOwner } = await supabase
        .from("users")
        .select("id")
        .eq("account_id", accountId)
        .eq("role", "owner")
        .neq("id", userId)
        .maybeSingle();

      if (existingOwner) {
        return NextResponse.json(
          { error: "Only one owner allowed per account" },
          { status: 400 }
        );
      }
    }

    // Update the role
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update({ role })
      .eq("id", userId)
      .eq("account_id", accountId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating role:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error: any) {
    console.error("Error changing role:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































