import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Slot = {
  id: string;
  start_utc: string;
  end_utc: string;
  score: number;
  provisional?: boolean;
  url?: string | null;
};

function scoreDistance(target: Date, candidate: Date) {
  const diffMin = Math.abs((candidate.getTime() - target.getTime()) / 60000);
  return diffMin + (diffMin > 60 ? 10 : 0) + (diffMin > 24 * 60 ? 40 : 0);
}

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));

  const slotId = typeof body?.slot_id === "string" ? body.slot_id : undefined;
  const requestedN = Number.isFinite(body?.n) ? Number(body.n) : 3;
  const n = Math.min(Math.max(requestedN, 1), 6);

  if (!slotId) {
    return NextResponse.json({ error: "missing_slot_id" }, { status: 400 });
  }

  const [{ data: slot, error: slotError }, { data: thread, error: threadError }] = await Promise.all([
    supabase.from("meeting_slots").select("*").eq("id", slotId).maybeSingle(),
    supabase
      .from("inbox_threads")
      .select("id,campaign_id,lead_id,assigned_to")
      .eq("id", params.threadId)
      .maybeSingle(),
  ]);

  if (slotError) {
    return NextResponse.json({ error: slotError.message }, { status: 500 });
  }
  if (!slot || slot.thread_id !== params.threadId) {
    return NextResponse.json({ error: "slot_not_found" }, { status: 404 });
  }
  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 500 });
  }
  if (!thread) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const [{ data: intent }, { data: prefs }] = await Promise.all([
    supabase
      .from("meeting_intents")
      .select("lead_tz,duration_min")
      .eq("thread_id", params.threadId)
      .maybeSingle(),
    thread.campaign_id
      ? supabase.from("meeting_prefs").select("*").eq("campaign_id", thread.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const leadTz = intent?.lead_tz || "America/New_York";
  const duration = intent?.duration_min ?? prefs?.duration_min ?? 30;
  const startHour = prefs?.start_hour ?? 9;
  const endHour = prefs?.end_hour ?? 17;
  const workdays = Array.isArray(prefs?.workdays) ? (prefs?.workdays as number[]) : [1, 2, 3, 4, 5];
  const target = new Date(slot.start_utc);

  const { data: all } = await supabase
    .from("meeting_slots")
    .select("id,start_utc,end_utc,score")
    .eq("thread_id", params.threadId)
    .order("start_utc", { ascending: true });

  const pool: Slot[] = (all ?? []).filter((s) => s.id !== slotId);

  let extras: Slot[] = [];
  if (pool.length < n * 2) {
    const dayStart = new Date(target);
    const candidateHours: number[] = [];
    for (let hour = startHour; hour <= endHour - Math.ceil(duration / 60); hour += 1) {
      candidateHours.push(hour);
    }

    const year = dayStart.getUTCFullYear();
    const month = dayStart.getUTCMonth();
    const date = dayStart.getUTCDate();

    const sameDay: Slot[] = candidateHours.map((hour) => {
      const start = new Date(Date.UTC(year, month, date, hour, 5, 0));
      const end = new Date(start.getTime() + duration * 60000);
      return {
        id: randomUUID(),
        start_utc: start.toISOString(),
        end_utc: end.toISOString(),
        score: 1,
        provisional: true,
      };
    });

    extras = sameDay.filter(
      (candidate) =>
        Math.abs(new Date(candidate.start_utc).getTime() - target.getTime()) >= 15 * 60000,
    );
  }

  const byKey = new Map<string, Slot>();
  for (const entry of [...pool, ...extras]) {
    byKey.set(entry.start_utc.slice(0, 16), entry);
  }
  const merged = Array.from(byKey.values());

  const repId = (thread.assigned_to as string | null) ?? null;
  const nowIso = new Date().toISOString();
  const { data: holds } = await supabase
    .from("meeting_slot_holds")
    .select("slot_id")
    .eq("thread_id", params.threadId)
    .gt("hold_until", nowIso);
  const heldSet = new Set((holds ?? []).map((h) => h.slot_id));

  async function isAvailable(candidate: Slot) {
    const start = new Date(candidate.start_utc);
    const end = new Date(candidate.end_utc);

    if (thread.lead_id) {
      try {
        const { data: leadChk } = await supabase
          .rpc("check_slot_available", {
            p_slot: candidate.provisional ? slot.id : candidate.id,
            p_lead: thread.lead_id,
          })
          .maybeSingle();
        if (leadChk && leadChk.available === false) {
          return false;
        }
      } catch (err) {
        console.error("lead availability check failed", err);
      }
    }

    if (repId) {
      try {
        const { data: repChk } = await supabase
          .rpc("is_user_busy", {
            p_user: repId,
            p_start: start.toISOString(),
            p_end: end.toISOString(),
          })
          .maybeSingle();
        if (repChk?.busy) {
          return false;
        }
      } catch (err) {
        console.error("rep busy check failed", err);
      }
    }

    if (!candidate.provisional && heldSet.has(candidate.id)) {
      return false;
    }

    const weekday = Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: leadTz,
        weekday: "numeric" as unknown as "numeric",
      }).format(start),
    );
    if (!workdays.includes(weekday)) {
      return false;
    }

    return true;
  }

  const checks = await Promise.all(
    merged.map(async (candidate) => ({ candidate, ok: await isAvailable(candidate) })),
  );
  const ok = checks.filter((result) => result.ok).map((result) => result.candidate);

  const ranked = ok
    .map((candidate) => ({
      candidate,
      distance: scoreDistance(target, new Date(candidate.start_utc)),
    }))
    .sort((a, b) => a.distance - b.distance || b.candidate.score - a.candidate.score)
    .slice(0, n)
    .map((entry) => entry.candidate);

  return NextResponse.json({ ok: true, items: ranked });
}


