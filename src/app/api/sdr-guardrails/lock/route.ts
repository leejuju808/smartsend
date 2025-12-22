import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { org_id, lock, reason } = body as {
      org_id: string;
      lock: boolean;
      reason?: string;
    };

    if (!org_id) {
      return NextResponse.json(
        { error: "org_id required" },
        { status: 400 },
      );
    }

    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a member of the org
    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Not a member of this organization" },
        { status: 403 },
      );
    }

    // Only admins and members can lock/unlock
    if (membership.role !== "admin" && membership.role !== "member") {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("sdr_settings")
      .update({
        autopilot_locked: lock,
        autopilot_locked_reason: lock ? reason || "manual_lock" : null,
        autopilot_locked_at: lock ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("org_id", org_id);

    if (updateError) {
      return NextResponse.json(
        { error: "update_failed", details: updateError },
        { status: 500 },
      );
    }

    await supabase.from("sdr_guardrail_events").insert({
      org_id,
      lead_id: null,
      email_domain: null,
      guardrail_type: lock ? "manual_lock" : "manual_unlock",
      message: lock ? "Autopilot manually locked" : "Autopilot manually unlocked",
      context: {
        reason: reason || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "unexpected", details: String(err) },
      { status: 500 },
    );
  }
}

