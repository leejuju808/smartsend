// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Create Estimate
// POST /api/estimates/create

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCompanyPaymentMomentGate } from "@/lib/billing/payment-moment";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      company_id,
      homeowner_id,
      line_items = [],
      tax_rate = 0,
      notes,
    } = body;

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    // Verify user owns the company
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, owner_id")
      .eq("id", company_id)
      .eq("owner_id", user.id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found or access denied" },
        { status: 403 }
      );
    }

    // BLOCK 268000 — Payment Moment Gate (Create Estimate)
    // After 3 estimates sent, block actions unless subscription is active.
    const gate = await checkCompanyPaymentMomentGate(supabase as any, company_id);
    if (gate.gated) {
      return NextResponse.json(
        {
          error:
            gate.reason === "past_due"
              ? "Update payment to continue sending estimates."
              : "Payment required to continue sending estimates.",
          code: "PAYWALL",
          estimates_sent: gate.estimatesSent,
          subscription: gate.subscription,
        },
        { status: 402 }
      );
    }

    // Calculate totals from line items
    let subtotal = 0;
    if (Array.isArray(line_items)) {
      subtotal = line_items.reduce((sum: number, item: any) => {
        const itemTotal = parseFloat(item.total || 0);
        return sum + itemTotal;
      }, 0);
    }

    const tax = subtotal * parseFloat(tax_rate.toString());
    const total = subtotal + tax;

    // Create estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .insert({
        company_id,
        homeowner_id: homeowner_id || null,
        created_by: user.id,
        line_items: Array.isArray(line_items) ? line_items : [],
        subtotal,
        tax_rate: parseFloat(tax_rate.toString()),
        tax,
        total,
        notes: notes || null,
        status: "draft",
        delivery_status: "draft",
      })
      .select()
      .single();

    if (estimateError) {
      console.error("Error creating estimate:", estimateError);
      return NextResponse.json(
        { error: "Failed to create estimate", details: estimateError.message },
        { status: 500 }
      );
    }

    // Proof-of-use event: created (best-effort)
    try {
      await supabase.from("estimate_events").insert({
        estimate_id: estimate.id,
        event_type: "created",
      });
    } catch (e) {
      console.warn("Failed to insert estimate created event:", e);
    }

    return NextResponse.json({
      ok: true,
      estimate,
    });
  } catch (error: any) {
    console.error("Error in /api/estimates/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























