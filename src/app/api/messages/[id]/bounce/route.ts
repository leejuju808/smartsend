import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: event, error: eventError } = await supa
    .from("bounce_events")
    .select("smtp_code,reason_key,action_key,raw_excerpt,created_at")
    .eq("message_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eventError) {
    console.error("bounce lookup failed", eventError);
    return NextResponse.json({ ok: false, error: eventError.message }, { status: 500 });
  }

  if (!event) {
    return NextResponse.json({ ok: true, bounce: null });
  }

  const { data: reason } = await supa
    .from("bounce_reasons")
    .select("label")
    .eq("key", event.reason_key)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    bounce: {
      ...event,
      reason_label: reason?.label ?? event.reason_key,
    },
  });
}

