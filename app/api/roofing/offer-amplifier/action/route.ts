import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ActionTaken = "upgrade" | "dismissed" | "paused" | "none";

function startOfLocalTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      company_id?: string;
      impression_id?: string | null;
      action_taken?: ActionTaken;
    };

    const companyId = body.company_id;
    const impressionId = body.impression_id || null;
    const actionTaken = body.action_taken;

    if (!companyId || !actionTaken || !["upgrade", "dismissed", "paused", "none"].includes(actionTaken)) {
      return NextResponse.json({ error: "company_id and valid action_taken are required" }, { status: 400 });
    }

    // v1: verify user is an active company member
    const { data: member } = await supabase
      .from("roofing_company_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("roofing_company_id", companyId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!member?.id) {
      // fallback: company owner path
      const { data: company } = await supabase
        .from("roofing_companies")
        .select("owner_id")
        .eq("id", companyId)
        .maybeSingle();
      if (!company?.owner_id || company.owner_id !== user.id) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Dismiss is once per day max: if already dismissed today, ignore.
    const todayStartIso = startOfLocalTodayIso();
    if (actionTaken === "dismissed") {
      const { data: existingDismiss } = await supabase
        .from("offer_impressions")
        .select("id")
        .eq("company_id", companyId)
        .eq("action_taken", "dismissed")
        .gte("shown_at", todayStartIso)
        .limit(1)
        .maybeSingle();
      if (existingDismiss?.id) return NextResponse.json({ ok: true, ignored: true });
    }

    if (impressionId) {
      const { error } = await supabase
        .from("offer_impressions")
        .update({ action_taken: actionTaken })
        .eq("id", impressionId)
        .eq("company_id", companyId);

      if (error) {
        return NextResponse.json({ error: error.message || "Failed to update impression" }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // Fallback: update latest impression for this company
    const { data: latest } = await supabase
      .from("offer_impressions")
      .select("id")
      .eq("company_id", companyId)
      .order("shown_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest?.id) return NextResponse.json({ ok: true, ignored: true });

    const { error: updErr } = await supabase
      .from("offer_impressions")
      .update({ action_taken: actionTaken })
      .eq("id", latest.id)
      .eq("company_id", companyId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message || "Failed to update impression" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in /api/roofing/offer-amplifier/action:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}









