import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const Body = z
  .object({
    top_n: z.number().int().min(1).max(5).default(3),
    slot_ids: z.array(z.string().min(1)).min(1).max(6).optional(),
  })
  .passthrough();

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const parsedBody = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }
  const { top_n, slot_ids } = parsedBody.data;

  const {
    data: thread,
    error: threadErr,
  } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,lead_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const slotsPromise = slot_ids?.length
    ? supabase
        .from("meeting_slots")
        .select("id,start_utc,end_utc,score")
        .eq("thread_id", thread.id)
        .in("id", slot_ids)
    : supabase
        .from("meeting_slots")
        .select("id,start_utc,end_utc,score")
        .eq("thread_id", thread.id)
        .order("score", { ascending: false })
        .limit(top_n);

  const [{ data: slots, error: slotsErr }, { data: lead, error: leadErr }] = await Promise.all([
    slotsPromise,
    thread.lead_id
      ? supabase.from("leads").select("email").eq("id", thread.lead_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (slotsErr) {
    return NextResponse.json({ error: slotsErr.message }, { status: 500 });
  }
  if (leadErr) {
    return NextResponse.json({ error: leadErr.message }, { status: 500 });
  }

  const leadEmail = lead?.email ?? null;
  const orderedSlots = slot_ids?.length
    ? (slots ?? []).sort((a, b) => {
        const ai = slot_ids.indexOf(a.id);
        const bi = slot_ids.indexOf(b.id);
        return ai - bi;
      })
    : slots ?? [];

  const tokenRows = orderedSlots.map((slot) => ({
    thread_id: thread.id,
    slot_id: slot.id,
    lead_email: leadEmail,
  }));

  if (tokenRows.length) {
    const { error: upsertErr } = await supabase
      .from("meeting_booking_tokens")
      .upsert(tokenRows, { onConflict: "thread_id,slot_id" });
    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) {
    return NextResponse.json({ error: "app_url_missing" }, { status: 500 });
  }

  const links = orderedSlots.map((slot) => ({
    slot_id: slot.id,
    start_utc: slot.start_utc,
    end_utc: slot.end_utc,
    url: `${appUrl}/api/book/${thread.id}:${slot.id}`,
  }));

  return NextResponse.json({ ok: true, items: links });
}

