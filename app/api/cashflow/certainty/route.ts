import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "No org" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("roofing_cash_certainty_summary")
      .select("org_id, money_in_motion, cash_likely_this_week, cash_likely_next_week, stalled_amount, stalled_count")
      .eq("org_id", orgId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      summary: data ?? {
        org_id: orgId,
        money_in_motion: 0,
        cash_likely_this_week: 0,
        cash_likely_next_week: 0,
        stalled_amount: 0,
        stalled_count: 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}



