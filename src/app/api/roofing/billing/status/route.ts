import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCompanyPaymentMomentGate } from "@/lib/billing/payment-moment";

/**
 * BLOCK 268000 — Payment Moment v1
 * GET /api/roofing/billing/status?company_id=...
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const company_id = req.nextUrl.searchParams.get("company_id");
    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    // v1: owner-only (matches existing estimate routes)
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .single();

    if (companyError || !company || company.owner_id !== user.id) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const gate = await checkCompanyPaymentMomentGate(supabase as any, company_id);

    return NextResponse.json({
      ok: true,
      company_id,
      estimates_sent: gate.estimatesSent,
      gate_active: gate.estimatesSent >= 3,
      gated: gate.gated,
      subscription: gate.subscription,
    });
  } catch (error: any) {
    console.error("Error loading company billing status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}










