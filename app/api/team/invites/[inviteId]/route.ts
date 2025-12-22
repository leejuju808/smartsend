// app/api/team/invites/[inviteId]/route.ts
// Block 265: Cancel workspace invite

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { enforceRole } from "@/lib/middleware/enforceRole";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(
  req: NextRequest,
  { params }: { params: { inviteId: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the invite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("workspace_invites")
      .select("workspace_id")
      .eq("id", params.inviteId)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    // Check permissions: only owner/admin can cancel invites
    const authCheck = await enforceRole(["owner", "admin"], invite.workspace_id);
    if ("error" in authCheck) {
      return authCheck.error;
    }

    // Delete the invite
    const { error: deleteError } = await supabaseAdmin
      .from("workspace_invites")
      .delete()
      .eq("id", params.inviteId);

    if (deleteError) {
      console.error("Error canceling invite:", deleteError);
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error canceling invite:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









