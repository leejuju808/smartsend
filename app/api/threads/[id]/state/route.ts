import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase env not configured" },
      { status: 500 }
    );
  }

  const supa = createClient(supabaseUrl, serviceRoleKey);

  const { data: thread, error: threadError } = await supa
    .from("threads")
    .select("id, paused_until, lead_id, last_inbound_label")
    .eq("id", params.id)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json(
      { ok: false, error: threadError.message },
      { status: 500 }
    );
  }

  let preset: string | undefined;
  if (thread?.lead_id) {
    const { data: lead, error: leadError } = await supa
      .from("leads")
      .select("next_nudge_preset")
      .eq("id", thread.lead_id)
      .maybeSingle();
    if (leadError) {
      return NextResponse.json(
        { ok: false, error: leadError.message },
        { status: 500 }
      );
    }
    preset = lead?.next_nudge_preset ?? undefined;
  }

  return NextResponse.json({ ok: true, thread, preset });
}

