import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getAccountRole } from "@/lib/auth/requireAccountRole";

// GET /api/settings/team/list - List all team members and pending invites
export async function GET(req: NextRequest) {
  try {
    const roleData = await getAccountRole();
    if (!roleData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const accountId = roleData.account_id;

    // Get all team members
    const { data: members, error: membersError } = await supabase
      .from("users")
      .select(`
        id,
        email,
        name,
        role,
        created_at,
        invited_by,
        auth_user_id
      `)
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    // Get pending invites
    const { data: invites, error: invitesError } = await supabase
      .from("user_invites")
      .select(`
        id,
        email,
        role,
        created_at,
        expires_at,
        invited_by
      `)
      .eq("account_id", accountId)
      .eq("accepted", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (invitesError) {
      console.error("Error fetching invites:", invitesError);
      return NextResponse.json(
        { error: invitesError.message },
        { status: 500 }
      );
    }

    // Get account permissions
    const { data: account } = await supabase
      .from("billing_accounts")
      .select("meta, seats")
      .eq("id", accountId)
      .single();

    const permissions = account?.meta?.permissions || {};
    const seatsAllowed = account?.seats || 1;
    const seatsInUse = (members?.length || 0) + (invites?.length || 0);

    return NextResponse.json({
      members: members || [],
      invites: invites || [],
      permissions,
      seats: {
        in_use: seatsInUse,
        allowed: seatsAllowed,
      },
    });
  } catch (error: any) {
    console.error("Error listing team:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























































