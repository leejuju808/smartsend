import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const [{ data: slots, error: slotsError }, { data: thread, error: threadError }] = await Promise.all([
    supabase
      .from("meeting_slots")
      .select("id,start_utc,end_utc,score")
      .eq("thread_id", params.threadId)
      .order("start_utc", { ascending: true }),
    supabase
      .from("inbox_threads")
      .select("id,assigned_to")
      .eq("id", params.threadId)
      .maybeSingle(),
  ]);

  if (slotsError) {
    return NextResponse.json({ error: slotsError.message }, { status: 500 });
  }

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { data: holds } = await supabase
    .from("meeting_slot_holds")
    .select("slot_id")
    .eq("thread_id", params.threadId)
    .gt("hold_until", nowIso);
  const heldSet = new Set((holds ?? []).map((row) => row.slot_id));

  const repId = (thread?.assigned_to as string | null) ?? null;
  const repBusyMap = new Map<string, boolean>();

  if (repId && Array.isArray(slots)) {
    const checks = await Promise.all(
      slots.map(async (slot) => {
        try {
          const { data: repChk } = await supabase
            .rpc("is_user_busy", {
              p_user: repId,
              p_start: slot.start_utc,
              p_end: slot.end_utc,
            })
            .maybeSingle();
          return { slotId: slot.id, busy: Boolean(repChk?.busy) };
        } catch (err) {
          console.error("is_user_busy failed", err);
          return { slotId: slot.id, busy: false };
        }
      }),
    );
    for (const check of checks) {
      repBusyMap.set(check.slotId, check.busy);
    }
  }

  const items = (slots ?? []).map((slot) => ({
    ...slot,
    held: heldSet.has(slot.id),
    rep_busy: repBusyMap.get(slot.id) ?? false,
  }));

  return NextResponse.json({ items });
}

