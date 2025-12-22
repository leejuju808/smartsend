import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/cron/policy-enforce?key=$CRON_SECRET
 *
 * Institutional policy enforcement:
 * - Ensures institutional-policy-locked workspaces are not manually paused
 * - Writes daily outreach proof-of-life
 * - Creates the Daily Operator task (idempotent)
 * - Block 273700: Auto-lock proven paths when evidence is sufficient
 */
function authorize(req: NextRequest) {
  const key = new URL(req.url).searchParams.get("key");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (!cronSecret) return false;
  return key === cronSecret;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Best-effort: only applies to DBs that have the institutional_policy_locked column.
    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id, outreach_state, outreach_paused_reason, institutional_policy_locked")
      .eq("institutional_policy_locked", true)
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (workspaces ?? []).map((w: any) => String(w?.id || "")).filter(Boolean);
    let resumed = 0;
    let logged = 0;
    let tasksCreated = 0;

    for (const ws of workspaces ?? []) {
      const wid = String((ws as any)?.id || "");
      if (!wid) continue;

      const state = String((ws as any)?.outreach_state || "running").toLowerCase();
      const reason = String((ws as any)?.outreach_paused_reason || "").toLowerCase();

      // If manual pause slipped in (older DBs / legacy data), flip it back on.
      if (state === "paused" && reason === "manual") {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("workspaces")
          .update({ outreach_state: "running", outreach_paused_at: null, outreach_paused_reason: null, outreach_last_resumed_at: nowIso })
          .eq("id", wid);
        resumed++;
      }

      // Proof-of-life: "outreach ran today"
      await supabaseAdmin.rpc("ss_outreach_log_today", { p_workspace_id: wid }).catch(() => null);
      logged++;

      // Daily operator task (idempotent, assigned to on-duty operator)
      const { data: taskId } = await supabaseAdmin
        .rpc("ss_policy_create_daily_operator_task", { p_workspace_id: wid })
        .catch(() => ({ data: null } as any));
      if (taskId) tasksCreated++;

      // BLOCK 273700: If the system has proof (jobs + reply health), lock the proven path.
      // Best-effort: older DBs may not have the function yet.
      try {
        await supabaseAdmin.rpc("ss_maybe_lock_proven_path", { p_workspace_id: wid }).catch(() => null);
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      workspaces: ids.length,
      resumed_manual_pauses: resumed,
      outreach_proof_written: logged,
      daily_operator_tasks_created: tasksCreated,
    });
  } catch (e: any) {
    console.error("policy-enforce cron error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}


