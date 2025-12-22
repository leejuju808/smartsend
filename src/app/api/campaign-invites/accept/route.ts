import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase.rpc("accept_campaign_invite", { p_token: token });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ campaign_id: data }, { headers: { "content-type": "application/json" }});
}

