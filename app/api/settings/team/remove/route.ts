import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole } from "@/lib/auth/requireAccountRole";

// DELETE /api/settings/team/remove - Remove a team member
export async function DELETE(req: NextRequest) {
  try {
    // Only owners can remove members
    const gate = await requireAccountRole(["owner"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const { roleData } = gate;
    const accountId = roleData.account_id;

    // Get the user to remove
    const { data: userToRemove } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", userId)
      .eq("account_id", accountId)
      .single();

    if (!userToRemove) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Prevent removing yourself if you're the account owner
    if (userToRemove.id === roleData.user_id && roleData.is_account_owner) {
      return NextResponse.json(
        { error: "Cannot remove account owner" },
        { status: 400 }
      );
    }

    // Remove the user
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId)
      .eq("account_id", accountId);

    if (deleteError) {
      console.error("Error removing user:", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error removing user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























































