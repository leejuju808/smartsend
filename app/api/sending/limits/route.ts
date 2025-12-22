import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("workspace_sending_limits")
    .select("*").eq("workspace_id", u.user.id).maybeSingle();

  // defaults if none
  return NextResponse.json({
    ok: true,
    limits: data ?? {
      workspace_id: u.user.id,
      base_rpm: 10, max_rpm: 120, warmup_days: 14,
      warmup_start_date: new Date().toISOString().slice(0,10),
      daily_cap: 1500
    }
  });
}

export async function PUT(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates = {
    workspace_id: u.user.id,
    base_rpm: Math.max(1, Number(body.base_rpm ?? 10)),
    max_rpm: Math.max(1, Number(body.max_rpm ?? 120)),
    warmup_days: Math.max(1, Number(body.warmup_days ?? 14)),
    warmup_start_date: (body.warmup_start_date ?? new Date().toISOString().slice(0,10)),
    daily_cap: Math.max(1, Number(body.daily_cap ?? 1500)),
    updated_at: new Date().toISOString()
  };

  // upsert
  const { error } = await supabase
    .from("workspace_sending_limits")
    .upsert(updates, { onConflict: "workspace_id" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}