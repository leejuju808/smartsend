import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole } from "@/lib/auth/requireAccountRole";

// DELETE /api/settings/team/invites/[id] - Cancel/revoke an invite
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Only owners can revoke invites
    const gate = await requireAccountRole(["owner"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const inviteId = params.id;
    const accountId = gate.roleData.account_id;

    // Delete the invite
    const { error: deleteError } = await supabase
      .from("user_invites")
      .delete()
      .eq("id", inviteId)
      .eq("account_id", accountId);

    if (deleteError) {
      console.error("Error revoking invite:", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error revoking invite:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























































