import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data } = await sb.from("email_prefs").select("*").eq("lead_id", params.id).maybeSingle();
  return NextResponse.json({ data });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const body = await req.json();
  const { data: user } = await sb.auth.getUser();

  if (!user?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountId = user.user.id;
  const row = { account_id: accountId, lead_id: params.id, ...body, updated_at: new Date().toISOString() };
  const { data } = await sb.from("email_prefs").upsert(row, { onConflict: "account_id,lead_id" }).select().single();
  if (body.unsubscribed === true) await sb.rpc("apply_unsubscribe", { p_account_id: accountId, p_lead_id: params.id, p_reason: "manual_admin" });
  return NextResponse.json({ data });
}















