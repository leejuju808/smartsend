import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { stripe } from "@/src/lib/stripe";

/**
 * POST /api/payments/deposit-request
 * Quick action: Request a deposit for a job
 * Creates invoice + payment link in one call
 */
export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json();
    const { job_id, amount, homeowner_name, homeowner_email, deposit_type = "50_percent" } = body;

    if (!job_id || !homeowner_name || !homeowner_email) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, homeowner_name, homeowner_email" },
        { status: 400 }
      );
    }

    // Get job to calculate deposit amount if needed
    let depositAmount = amount;
    if (!depositAmount && deposit_type === "50_percent") {
      const { data: job } = await supabase
        .from("roofing_jobs")
        .select("projected_job_value, job_value")
        .eq("id", job_id)
        .single();

      if (job) {
        const jobValue = job.projected_job_value || job.job_value || 0;
        depositAmount = jobValue * 0.5; // 50% deposit
      }
    }

    if (!depositAmount || depositAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid deposit amount" },
        { status: 400 }
      );
    }

    // Create deposit invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        org_id: orgId,
        job_id,
        homeowner_name,
        homeowner_email,
        amount_due: depositAmount,
        invoice_type: "deposit",
        status: "pending",
        notes: `Deposit request for job ${job_id}`,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Error creating deposit invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create deposit invoice" },
        { status: 500 }
      );
    }

    // Create Stripe payment link
    const stripeLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Deposit - Invoice ${invoice.invoice_number}`,
              description: `Deposit payment to secure materials and schedule installation for ${homeowner_name}`,
            },
            unit_amount: Math.round(depositAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        invoice_id: invoice.id,
        org_id: orgId,
        job_id,
        homeowner_email,
        invoice_type: "deposit",
      },
    });

    // Store payment link
    const { error: linkError } = await supabase.from("payment_links").insert({
      invoice_id: invoice.id,
      payment_url: stripeLink.url,
      stripe_payment_link_id: stripeLink.id,
      link_type: "deposit",
      amount: depositAmount,
      is_active: true,
    });

    if (linkError) {
      console.error("Error storing payment link:", linkError);
    }

    // Update job payment status
    await supabase
      .from("roofing_jobs")
      .update({
        deposit_collected: false,
        deposit_amount: depositAmount,
        payment_status: "unpaid",
      })
      .eq("id", job_id);

    return NextResponse.json({
      invoice,
      payment_link: stripeLink.url,
      message: "Deposit request created successfully",
    });
  } catch (error: any) {
    console.error("Error in deposit request:", error);
    return NextResponse.json(
      { error: "Failed to create deposit request", details: error.message },
      { status: 500 }
    );
  }
}



























