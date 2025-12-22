import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { getActiveOrg } from "@/lib/org";

export async function GET() {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(); if (!org) return NextResponse.json({ error: "no_org" }, { status: 400 });

  const { data } = await sb.from("org_send_settings")
    .select("timezone, window_start, window_end, weekdays")
    .eq("org_id", org.id).maybeSingle();

  return NextResponse.json({ settings: data });
}

export async function POST(req: Request) {
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getActiveOrg(); if (!org) return NextResponse.json({ error: "no_org" }, { status: 400 });

  const { timezone, window_start, window_end, weekdays } = await req.json();
  const { error } = await sb.from("org_send_settings").upsert({
    org_id: org.id,
    timezone,
    window_start,
    window_end,
    weekdays,
    updated_at: new Date().toISOString()
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}