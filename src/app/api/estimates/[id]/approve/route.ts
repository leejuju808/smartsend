// Block 267100 — Mark Estimate as Approved (manual v1)
// POST /api/estimates/[id]/approve

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications/createNotification";

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

    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("estimates")
      .update({
        approved_at: nowIso,
        status: "approved",
        // Block 268600 — close attribution (visible in UI)
        closed_via: "smartsend",
        closed_at: nowIso,
        status_updated_at: nowIso,
        // Block 269100 — Reality Anchor: permanent origin label on closed jobs
        origin_source: "smartsend",
        // Block 269000 — stop follow-ups immediately on approval
        followup_status: "completed",
        next_followup_at: null,
      })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to mark approved", details: updateErr.message },
        { status: 500 }
      );
    }

    await supabase.from("estimate_events").insert({
      estimate_id: id,
      event_type: "approved",
    });

    // Block 271700 — Zero-Notification Mode: allow estimate-approved ping (ambient ops)
    const orgId = estimate.company?.org_id ?? estimate.company?.workspace_id ?? null;
    const ownerUserId = estimate.company?.owner_id ?? null;

    if (orgId && ownerUserId) {
      await createNotification({
        orgId,
        userId: ownerUserId,
        category: "lead",
        type: "estimate_approved",
        title: "✅ Estimate approved",
        body: estimate.total ? `Approved · Total: $${estimate.total}` : "Approved",
        url: `/dashboard/estimates/${id}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error in /api/estimates/[id]/approve:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}










