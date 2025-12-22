import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { campaignId, memberUserId } = await req.json();
  if (!campaignId || !memberUserId) {
    return NextResponse.json({ error: "campaignId & memberUserId required" }, { status: 400 });
  }

  // Use the RPC function which handles auth and audit
  const { error } = await supabase.rpc("remove_campaign_member", {
    p_campaign: campaignId,
    p_user: memberUserId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


