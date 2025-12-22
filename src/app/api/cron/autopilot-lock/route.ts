import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function authorize(req: NextRequest) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("key");
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return key && key === expected;
}

function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

/**
 * POST /api/cron/autopilot-lock
 * When AUTOPILOT has been enabled for >= autopilot_lock_days, mark it irreversible.
 */
export async function POST(req: NextRequest) {
  try {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const nowIso = new Date().toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, autopilot_enabled, autopilot_enabled_at, autopilot_locked, autopilot_lock_days")
      .eq("autopilot_enabled", true)
      .limit(5000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let locked = 0;
    for (const ws of (rows || []) as any[]) {
      if (!ws?.id) continue;
      if (ws.autopilot_locked === true) continue;
      if (!ws.autopilot_enabled_at) continue;
      const lockDays = Number.isFinite(Number(ws.autopilot_lock_days)) ? Math.max(0, Math.floor(Number(ws.autopilot_lock_days))) : 14;
      const daysIn = daysBetween(String(ws.autopilot_enabled_at), nowIso);
      if (daysIn < lockDays) continue;

      await supabaseAdmin
        .from("workspaces")
        .update({ autopilot_locked: true, autopilot_locked_at: nowIso } as any)
        .eq("id", ws.id);

      try {
        await supabaseAdmin.from("autopilot_events").insert({
          workspace_id: ws.id,
          occurred_at: nowIso,
          actor_user_id: null,
          event_type: "locked",
          meta: { days_in_autopilot: daysIn, lock_days: lockDays },
        } as any);
      } catch {}

      locked++;
    }

    return NextResponse.json({ ok: true, locked });
  } catch (e: any) {
    console.error("autopilot-lock cron error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}




