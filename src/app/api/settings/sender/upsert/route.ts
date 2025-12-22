// File: app/api/settings/sender/upsert/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

type Body = {
  user_id: string;
  scheduling_url?: string | null;
  daily_cap?: number | null;
  hard_bounce_threshold?: number | null;
  nudge_delay_hours?: number | null;
  max_nudges_per_lead?: number | null;
  warmup_enabled?: boolean | null;
  block_on_threshold?: boolean | null;
};

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    if (!b.user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

    const updates: any = { user_id: b.user_id, updated_at: new Date().toISOString() };
    if (b.scheduling_url !== undefined) updates.scheduling_url = b.scheduling_url;
    if (b.daily_cap !== undefined && b.daily_cap !== null) updates.daily_cap = b.daily_cap;
    if (b.hard_bounce_threshold !== undefined && b.hard_bounce_threshold !== null) updates.hard_bounce_threshold = b.hard_bounce_threshold;
    if (b.nudge_delay_hours !== undefined && b.nudge_delay_hours !== null) updates.nudge_delay_hours = b.nudge_delay_hours;
    if (b.max_nudges_per_lead !== undefined && b.max_nudges_per_lead !== null) updates.max_nudges_per_lead = b.max_nudges_per_lead;
    if (b.warmup_enabled !== undefined && b.warmup_enabled !== null) updates.warmup_enabled = b.warmup_enabled;
    if (b.block_on_threshold !== undefined && b.block_on_threshold !== null) updates.block_on_threshold = b.block_on_threshold;

    const client = sb();
    const { error } = await client
      .from("sender_settings")
      .upsert(updates, { onConflict: "user_id" });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "server_error" }, { status: 500 });
  }
}
