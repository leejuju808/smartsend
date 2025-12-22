import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function diffDaysCeil(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

/**
 * GET /api/billing/lock-metrics?workspace_id=...
 *
 * Returns factual “system dependency” context used by Billing UI:
 * - optimizing_days (days since workspace created_at)
 * - cancellation history flags
 * - basic raw data counts
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    // Verify membership (never trust client input)
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const nowIso = new Date().toISOString();

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .select(
        "id, created_at, outreach_state, outreach_paused_reason, has_canceled_before, first_canceled_at, last_canceled_at"
      )
      .eq("id", workspaceId)
      .maybeSingle();

    if (wsErr || !ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const createdAt = String((ws as any)?.created_at || "");
    const optimizingDays = createdAt ? diffDaysCeil(createdAt, nowIso) : 0;

    // Counts (kept lightweight; no heavy joins)
    const [campaigns, leads, appointments] = await Promise.all([
      supabaseAdmin
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabaseAdmin
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
    ]);

    return NextResponse.json(
      {
        workspace_id: workspaceId,
        now: nowIso,
        workspace_created_at: createdAt || null,
        optimizing_days: optimizingDays,
        outreach: {
          state: String((ws as any)?.outreach_state || "unknown"),
          paused_reason: (ws as any)?.outreach_paused_reason || null,
        },
        cancellation: {
          has_canceled_before: Boolean((ws as any)?.has_canceled_before),
          first_canceled_at: (ws as any)?.first_canceled_at || null,
          last_canceled_at: (ws as any)?.last_canceled_at || null,
        },
        data_counts: {
          campaigns: campaigns.count || 0,
          leads: leads.count || 0,
          appointments: appointments.count || 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("[billing/lock-metrics] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}



