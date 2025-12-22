// Block 268600 — Estimate Status Tracking (Ultra Simple)
// POST /api/estimates/[id]/status
// Body: { status: "draft" | "sent" | "waiting" | "approved" | "lost", lost_reason?: "price" | "timing" | "no_response" | "other" | null }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_STATUSES = ["draft", "sent", "waiting", "approved", "lost"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

const ALLOWED_LOST_REASONS = ["price", "timing", "no_response", "other"] as const;
type AllowedLostReason = (typeof ALLOWED_LOST_REASONS)[number];

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
    const status = String(body?.status || "").trim() as AllowedStatus;
    const lostReasonRaw = body?.lost_reason ?? body?.lostReason ?? null;

    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Load estimate and verify ownership
    const { data: estimate, error } = await supabase
      .from("estimates")
      .select(`*, company:roofing_companies(*)`)
      .eq("id", id)
      .single();

    if (error || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    if (estimate.company?.owner_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const nowIso = new Date().toISOString();

    // Normalize lost reason
    let lost_reason: AllowedLostReason | null = null;
    if (lostReasonRaw != null && String(lostReasonRaw).trim()) {
      const lr = String(lostReasonRaw).trim() as AllowedLostReason;
      if (!ALLOWED_LOST_REASONS.includes(lr)) {
        return NextResponse.json(
          { error: `Invalid lost_reason. Must be one of: ${ALLOWED_LOST_REASONS.join(", ")}` },
          { status: 400 }
        );
      }
      lost_reason = lr;
    }

    const update: any = {
      status,
      status_updated_at: nowIso,
    };

    if (status === "approved") {
      update.approved_at = nowIso;
      update.closed_via = "smartsend";
      update.closed_at = nowIso;
      // Block 269100 — Reality Anchor: permanent origin label on closed jobs
      update.origin_source = "smartsend";
      update.followup_status = "completed";
      update.next_followup_at = null;
      update.lost_at = null;
      update.lost_reason = null;
    } else if (status === "lost") {
      update.lost_at = nowIso;
      update.lost_reason = lost_reason;
      update.followup_status = "completed";
      update.next_followup_at = null;
      update.approved_at = null;
      update.closed_via = null;
      update.closed_at = null;
    } else {
      // draft/sent/waiting resets loss fields
      update.lost_at = null;
      update.lost_reason = null;
      if (status !== "sent" && status !== "waiting") {
        // if moving back to draft, followups should not run
        update.followup_status = "paused";
        update.next_followup_at = null;
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from("estimates")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to update estimate status", details: updateErr.message },
        { status: 500 }
      );
    }

    // Proof-of-use event (best-effort)
    try {
      if (status === "approved") {
        await supabase.from("estimate_events").insert({ estimate_id: id, event_type: "approved" });
      } else if (status === "sent") {
        await supabase.from("estimate_events").insert({ estimate_id: id, event_type: "sent" });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, estimate: updated });
  } catch (err: any) {
    console.error("Error in /api/estimates/[id]/status:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}








