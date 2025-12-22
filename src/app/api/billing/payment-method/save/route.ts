// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/payment-method/save
// Save a payment method (card or ACH) for a homeowner

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { stripe } from "@/src/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      homeowner_id,
      workspace_id,
      payment_method_id, // Stripe PaymentMethod ID
      set_as_default = false,
    } = body;

    if (!homeowner_id || !workspace_id || !payment_method_id) {
      return NextResponse.json(
        { error: "Missing required fields: homeowner_id, workspace_id, payment_method_id" },
        { status: 400 }
      );
    }

    // Retrieve payment method from Stripe
    const paymentMethod = await stripe.paymentMethods.retrieve(payment_method_id);

    if (!paymentMethod) {
      return NextResponse.json(
        { error: "Payment method not found in Stripe" },
        { status: 404 }
      );
    }

    // Extract payment method details
    let type: "card" | "ach" = "card";
    let last4: string | null = null;
    let brand: string | null = null;
    let exp_month: number | null = null;
    let exp_year: number | null = null;
    let bank_name: string | null = null;

    if (paymentMethod.type === "card" && paymentMethod.card) {
      type = "card";
      last4 = paymentMethod.card.last4;
      brand = paymentMethod.card.brand;
      exp_month = paymentMethod.card.exp_month;
      exp_year = paymentMethod.card.exp_year;
    } else if (paymentMethod.type === "us_bank_account" && paymentMethod.us_bank_account) {
      type = "ach";
      last4 = paymentMethod.us_bank_account.last4;
      bank_name = paymentMethod.us_bank_account.bank_name || null;
    } else {
      return NextResponse.json(
        { error: "Unsupported payment method type" },
        { status: 400 }
      );
    }

    // If setting as default, unset other defaults first
    if (set_as_default) {
      await supabase
        .from("payment_methods")
        .update({ is_default: false })
        .eq("homeowner_id", homeowner_id)
        .eq("is_default", true);
    }

    // Save payment method
    const { data: savedMethod, error: saveError } = await supabase
      .from("payment_methods")
      .insert({
        homeowner_id,
        workspace_id,
        stripe_payment_method_id: payment_method_id,
        type,
        last4,
        brand,
        exp_month,
        exp_year,
        bank_name,
        is_default: set_as_default,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving payment method:", saveError);
      return NextResponse.json(
        { error: "Failed to save payment method", details: saveError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payment_method: savedMethod,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/payment-method/save:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























