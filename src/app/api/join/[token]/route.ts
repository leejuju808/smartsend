import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: res, error } = await supabase.rpc("accept_campaign_invite", { p_token: params.token });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!res) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
  return NextResponse.json({ ok: true });
}


