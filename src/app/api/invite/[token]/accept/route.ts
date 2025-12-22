import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("accept_campaign_invite", { p_token: params.token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    return NextResponse.json({ error: "Invalid or already-accepted invite" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, campaign_id: row.campaign_id });
}



