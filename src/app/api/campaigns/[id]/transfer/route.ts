import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = serverClient();
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  // find new owner by email
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();

  if (pErr || !profile) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const { error: rpcErr } = await supabase.rpc("transfer_campaign_ownership", {
    p_campaign: params.id,
    p_new_owner: profile.id,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

