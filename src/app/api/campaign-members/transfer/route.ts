import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { campaign_id, new_owner_user_id } = await req.json();

  if (!campaign_id || !new_owner_user_id) {
    return NextResponse.json({ error: "campaign_id and new_owner_user_id required" }, { status: 400 });
  }

  // Use caller JWT so RLS/auth context = real user (owner check happens in RPC)
  const sb = createRouteHandlerClient({ cookies });

  const { error } = await sb.rpc("transfer_campaign_ownership", {
    p_campaign: campaign_id,
    p_new_owner: new_owner_user_id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

