import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const ws = profile?.workspace_id;
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 400 });

  const body = await req.json();

  const payload = {
    campaign_id: params.id,
    start_at: body.start_at,
    end_at: body.end_at ?? null,
    batch_size: body.batch_size ?? 200,
    drip_per_minute: body.drip_per_minute ?? 1,
    tz_window: body.tz_window ?? { start: 9, end: 17 },
    days: body.days ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
    balance_mode: body.balance_mode ?? "proportional",
    reply_guard: body.reply_guard ?? true,
    max_daily_per_identity: body.max_daily_per_identity ?? null,
  };

  if (!payload.start_at) {
    return NextResponse.json({ error: "start_at is required" }, { status: 400 });
  }

  const { error: scheduleError } = await supabase
    .from("campaign_schedules")
    .upsert(payload);

  if (scheduleError) {
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ status: "scheduled" })
    .eq("id", params.id)
    .eq("workspace_id", ws);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


