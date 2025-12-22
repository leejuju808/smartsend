import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supa.from("sending_policies").select("*").eq("account_id", params.id).maybeSingle();
  if (!data) return NextResponse.json({ timezone: "America/Los_Angeles", daily_cap:150, hourly_cap:20, warmup_enabled:true, warmup_day_1:10, warmup_growth:1, quiet_hours_start:20, quiet_hours_end:7, send_weekends:false });
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { error } = await supa.from("sending_policies").upsert({ account_id: params.id, ...body }, { onConflict: "account_id" });
  if (error) return new NextResponse(error.message, { status: 400 });
  return NextResponse.json({ ok: true });
}

