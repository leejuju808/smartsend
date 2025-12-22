import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { stripe } from "@/src/lib/stripe";

/**
 * POST /api/payments/invoices/[id]/payment-link
 * Create a Stripe payment link for an existing invoice
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId();
    if (!orgId) {
      return NextResponse.json(
        { error: "Organization required" },
        { status: 400 }
      );
    }

    // Get invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Check if payment link already exists and is active
    const { data: existingLink } = await supabase
      .from("payment_links")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("is_active", true)
      .single();

    if (existingLink) {
      return NextResponse.json({
        payment_link: existingLink.payment_url,
        payment_link_id: existingLink.id,
      });
    }

    // Calculate amount remaining
    const amountRemaining = invoice.amount_due - invoice.amount_paid;

    if (amountRemaining <= 0) {
      return NextResponse.json(
        { error: "Invoice is already fully paid" },
        { status: 400 }
      );
    }

    // Create Stripe payment link
    const stripeLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: `Payment for ${invoice.homeowner_name}`,
            },
            unit_amount: Math.round(amountRemaining * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: invoice.id,
        org_id: orgId,
        homeowner_email: invoice.homeowner_email,
        invoice_type: invoice.invoice_type,
      },
    });

    // Store payment link in database
    const { error: linkError } = await supabase.from("payment_links").insert({
      invoice_id: invoice.id,
      payment_url: stripeLink.url,
      stripe_payment_link_id: stripeLink.id,
      link_type:
        invoice.invoice_type === "deposit"
          ? "deposit"
          : amountRemaining === invoice.amount_due
          ? "full_payment"
          : "partial",
      amount: amountRemaining,
      is_active: true,
    });

    if (linkError) {
      console.error("Error storing payment link:", linkError);
      // Still return the link even if DB insert fails
    }

    return NextResponse.json({
      payment_link: stripeLink.url,
      payment_link_id: stripeLink.id,
    });
  } catch (error: any) {
    console.error("Error creating payment link:", error);
    return NextResponse.json(
      { error: "Failed to create payment link", details: error.message },
      { status: 500 }
    );
  }
}



























