import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { role } = await req.json();
  if (!["viewer", "editor"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const campaignId = params.id;
  const userId = params.userId;

  // Use the RPC function which handles auth and audit
  const { error } = await supabase.rpc("change_campaign_member_role", {
    p_campaign: campaignId,
    p_user: userId,
    p_role: role,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

