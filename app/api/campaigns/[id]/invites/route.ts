import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { email, role } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: inviteId, error } = await supabase.rpc("invite_to_campaign", {
    p_campaign: params.id,
    p_email: email,
    p_role: role ?? "viewer",
    p_days: 7,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/accept?token=${inviteId}`;

  return NextResponse.json({ ok: true, link });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: members } = await supabase
    .from("v_campaign_collaborators")
    .select("*")
    .eq("campaign_id", params.id);

  const { data: invites } = await supabase
    .from("campaign_invites")
    .select("id,email,role,created_at,expires_at,accepted_at")
    .eq("campaign_id", params.id);

  return NextResponse.json({
    members: members ?? [],
    invites: invites ?? [],
  });
}







