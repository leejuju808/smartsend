import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.from("connected_accounts")
    .select("id, daily_cap, warmup_enabled, warmup_day, warmup_started_at, plan_id, warmup_plan_id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ account: data });
}

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify user owns this account
  const { data: account } = await sb.from("connected_accounts")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!account) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const patch: any = {};
  for (const k of ["daily_cap","warmup_enabled","warmup_day","warmup_started_at","plan_id"]) {
    if (k in body) patch[k] = body[k];
  }
  const { error } = await sb.from("connected_accounts")
    .update(patch)
    .eq("id", params.id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

