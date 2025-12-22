import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/billing/automations/deposit-request
 * Trigger automated deposit request for a job
 * This is called when a job is approved
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Get job details
    const { data: job } = await supabase
      .from("jobs")
      .select("id, workspace_id, estimated_value, final_value, homeowner_name, homeowner_email, homeowner_phone")
      .eq("id", job_id)
      .single();

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get payment schedule for deposit
    const { data: depositSchedule } = await supabase
      .from("payment_schedules")
      .select("*")
      .eq("job_id", job_id)
      .eq("milestone", "deposit")
      .eq("paid", false)
      .single();

    if (!depositSchedule) {
      return NextResponse.json(
        { error: "No deposit schedule found for this job" },
        { status: 404 }
      );
    }

    // Calculate deposit amount
    const depositAmount = depositSchedule.amount || 
      (depositSchedule.percentage && job.final_value 
        ? (job.final_value * depositSchedule.percentage / 100)
        : null);

    if (!depositAmount || depositAmount <= 0) {
      return NextResponse.json(
        { error: "Invalid deposit amount" },
        { status: 400 }
      );
    }

    // Generate invoice number
    const { data: invoiceNumberData } = await supabase
      .rpc("generate_invoice_number", { p_workspace_id: job.workspace_id });

    const invoiceNumber = invoiceNumberData || `INV-${Date.now()}`;

    // Create deposit invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        workspace_id: job.workspace_id,
        job_id: job.id,
        invoice_number,
        amount: depositAmount,
        due_date: new Date().toISOString().split('T')[0], // Due immediately
        issue_date: new Date().toISOString().split('T')[0],
        scope_summary: "Deposit required to secure your installation date",
        status: 'unpaid',
        created_by: user.id,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Error creating deposit invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create deposit invoice", details: invoiceError.message },
        { status: 500 }
      );
    }

    // Update payment schedule with invoice_id
    await supabase
      .from("payment_schedules")
      .update({ invoice_id: invoice.id })
      .eq("id", depositSchedule.id);

    // Generate payment link (you'll need to implement this based on your payment processor)
    const paymentLink = `/billing/customer-portal/${invoice.id}`; // Simplified for now

    // Update invoice with payment link
    await supabase
      .from("invoices")
      .update({ payment_link: paymentLink })
      .eq("id", invoice.id);

    // TODO: Send email/SMS to homeowner with deposit request
    // This would integrate with your email/SMS sending system
    // Example:
    // await sendEmail({
    //   to: job.homeowner_email,
    //   subject: "Your roof project is approved! Deposit required",
    //   body: `Your roof project is approved! Deposit required to secure your installation date. Amount Due: $${depositAmount}. Pay Now: ${paymentLink}`
    // });

    return NextResponse.json({
      invoice,
      message: "Deposit request created successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/automations/deposit-request:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}






















