import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type AcceptInvitePayload = {
  token: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<AcceptInvitePayload>;
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_campaign_invite", { p_token: token });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: data === true });
}





