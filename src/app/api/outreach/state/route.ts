import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";
import { blockIfPolicyLocked } from "@/lib/policy/guard";
import { blockIfProvenPathLocked, isValidDeviationReason } from "@/lib/authority/guard";

type OutreachState = "running" | "paused";

function baseUrl() {
  return (
    (process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000") as string
  ).replace(/\/$/, "");
}

/**
 * POST /api/outreach/state
 * Body: { workspace_id: string, state: "running" | "paused" }
 *
 * - Paused: outbound automation stops immediately.
 * - Running: outbound resumes immediately (best-effort nudge of workers).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const workspaceId = String((body as any).workspace_id || "");
    const state = String((body as any).state || "") as OutreachState;
    const reason = (body as any)?.reason;

    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    if (state !== "running" && state !== "paused") {
      return NextResponse.json({ error: "state must be running|paused" }, { status: 400 });
    }
    if (!isValidDeviationReason(reason)) {
      return NextResponse.json(
        { error: "reason required", allowed_reasons: ["capacity_change", "crew_change", "geographic_expansion"] },
        { status: 400 }
      );
    }

    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const role = String((membership as any).role || "");
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const autopilotGate = await blockIfAutopilotEnabled({
      req,
      workspaceId,
      action: "Outreach pause/resume",
    });
    if (autopilotGate.blocked) return autopilotGate.response;

    const lockGate = await blockIfProvenPathLocked({
      req,
      workspaceId,
      action: "Outreach pause/resume",
      createdBy: user.id,
      reason,
      target: "outreach_state",
      requestedChanges: { outreach_state: state },
      evidence: (body as any)?.evidence ?? {},
    });
    if (lockGate.blocked) return lockGate.response;

    // Block manual pause when institutional policy is locked.
    if (state === "paused") {
      const policyGate = await blockIfPolicyLocked({
        req,
        workspaceId,
        action: "Outreach pause",
      });
      if (policyGate.blocked) return policyGate.response;
    }

    const nowIso = new Date().toISOString();
    const update =
      state === "paused"
        ? {
            outreach_state: "paused",
            outreach_paused_at: nowIso,
            outreach_last_paused_at: nowIso,
            outreach_paused_reason: "manual",
          }
        : {
            outreach_state: "running",
            outreach_paused_at: null,
            outreach_paused_reason: null,
            outreach_last_resumed_at: nowIso,
          };

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .update(update)
      .eq("id", workspaceId)
      .select("id, outreach_state, outreach_paused_at, outreach_paused_reason, outreach_last_paused_at, outreach_last_resumed_at")
      .maybeSingle();

    if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });

    // If we resumed, nudge the engine immediately (best-effort).
    if (state === "running") {
      try {
        await supabaseAdmin.rpc("ss_outreach_log_today", { p_workspace_id: workspaceId }).catch(() => null);
      } catch {}

      // Kick the send worker right now (this endpoint is already designed as a worker).
      try {
        await fetch(`${baseUrl()}/api/send-queue`, { method: "POST", cache: "no-store" }).catch(() => null);
      } catch {}

      // Kick campaign sender cron right now (if CRON_SECRET is set).
      try {
        if (process.env.CRON_SECRET) {
          await fetch(`${baseUrl()}/api/cron/campaigns?key=${encodeURIComponent(process.env.CRON_SECRET)}`, {
            method: "POST",
            cache: "no-store",
          }).catch(() => null);
        }
      } catch {}
    }

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        outreach: {
          state: String((ws as any)?.outreach_state || state),
          paused_at: (ws as any)?.outreach_paused_at || null,
          paused_reason: (ws as any)?.outreach_paused_reason || null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error("outreach/state error:", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





