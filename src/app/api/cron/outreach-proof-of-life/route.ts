import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/cron/outreach-proof-of-life
 * Logs "Outreach ran today." for every RUNNING workspace.
 *
 * Auth: Authorization: Bearer $CRON_SECRET (if set)
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = req.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { data: workspaces, error } = await supabaseAdmin
      .from("workspaces")
      .select("id")
      .eq("outreach_state", "running")
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const ids = (workspaces || []).map((w: any) => String((w as any).id)).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    await Promise.all(ids.map((wid) => supabaseAdmin.rpc("ss_outreach_log_today", { p_workspace_id: wid }).catch(() => null)));

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e: any) {
    console.error("outreach-proof-of-life cron error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}





