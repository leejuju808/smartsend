// Block 269000 — Estimate Follow-Up Control (v1)
// POST /api/estimates/[id]/followups  { enabled: boolean }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function computeNextFollowupAt(sentAtISO: string | null | undefined, followupsSent: number) {
  if (!sentAtISO) return null;
  const sentAt = new Date(sentAtISO);
  if (Number.isNaN(sentAt.getTime())) return null;

  const nextStep = followupsSent + 1; // 1..3
  const offsetsDays = [2, 5, 9]; // fixed v1 sequence
  const days = offsetsDays[nextStep - 1];
  if (!days) return null;

  return new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const enabled = !!body?.enabled;

    const { data: estimate, error } = await supabase
      .from("estimates")
      .select(
        `
        *,
        company:roofing_companies(*)
      `
      )
      .eq("id", id)
      .single();

    if (error || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    if (estimate.company?.owner_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // If already approved, force completed
    if (estimate.status === "approved" || estimate.approved_at) {
      await supabase
        .from("estimates")
        .update({ followup_status: "completed", next_followup_at: null })
        .eq("id", id);
      return NextResponse.json({ ok: true, followup_status: "completed" });
    }

    if (!enabled) {
      await supabase
        .from("estimates")
        .update({ followup_status: "paused", next_followup_at: null })
        .eq("id", id);
      return NextResponse.json({ ok: true, followup_status: "paused" });
    }

    // enabled = true
    // Scale Gate v1: if Scale Locked, cap active follow-ups (no overrides)
    const companyId = String((estimate as any).company?.id || (estimate as any).company_id || "");
    if (companyId) {
      const { data: scale, error: scaleErr } = await supabase.rpc("compute_scale_readiness", {
        p_company_id: companyId,
        p_persist: false,
      });
      if (scaleErr) {
        return NextResponse.json({ error: scaleErr.message }, { status: 500 });
      }
      const row = Array.isArray(scale) ? scale[0] : scale;
      const tier = String((row as any)?.tier || "locked");
      if (tier === "locked") {
        const { count: activeCount, error: activeErr } = await supabase
          .from("estimates")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("followup_status", "active");
        if (activeErr) {
          return NextResponse.json({ error: activeErr.message }, { status: 500 });
        }
        if ((activeCount ?? 0) >= 25) {
          return NextResponse.json(
            { error: "Scale Locked: follow-ups are capped until deliverability and payment are stable." },
            { status: 403 }
          );
        }
      }
    }

    const { count: followupsSent } = await supabase
      .from("followups")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", id);

    const next = computeNextFollowupAt(estimate.sent_at, followupsSent ?? 0);

    await supabase
      .from("estimates")
      .update({
        followup_status: "active",
        next_followup_at: next,
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, followup_status: "active", next_followup_at: next });
  } catch (err: any) {
    console.error("Error in /api/estimates/[id]/followups:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}










