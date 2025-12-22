import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type CreateInvitePayload = {
  campaignId: string;
  email: string;
  role?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<CreateInvitePayload>;
  const campaignId = body?.campaignId;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "viewer";

  if (!campaignId || !email) {
    return NextResponse.json({ error: "campaignId and email are required" }, { status: 400 });
  }

  const supabase = createClient();

  const { data, error } = await supabase.rpc("create_campaign_invite", {
    p_campaign: campaignId,
    p_email: email,
    p_role: role,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data });
}





