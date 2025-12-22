import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mailer";

/**
 * POST /api/invoices/send
 * Sends an invoice to the homeowner via email with payment link
 * 
 * Input: { invoice_id, payment_link (optional) }
 * Output: { sent: true, sent_at }
 */
export async function POST(req: NextRequest) {
  try {
    const { invoice_id, payment_link } = await req.json();

    if (!invoice_id) {
      return NextResponse.json(
        { error: "invoice_id is required" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        payment_milestones (
          *,
          payment_schedules (
            *,
            contract_documents (
              *,
              leads (
                first_name,
                last_name,
                email,
                phone
              )
            ),
            roofing_jobs (
              title,
              address
            )
          )
        )
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const milestone = invoice.payment_milestones;
    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    const schedule = milestone.payment_schedules;
    if (!schedule) {
      return NextResponse.json(
        { error: "Payment schedule not found" },
        { status: 404 }
      );
    }

    const contract = schedule.contract_documents;
    const lead = contract?.leads;
    const job = schedule.roofing_jobs;

    if (!lead?.email) {
      return NextResponse.json(
        { error: "Homeowner email not found" },
        { status: 400 }
      );
    }

    // Generate payment link if not provided
    let finalPaymentLink = payment_link;
    if (!finalPaymentLink) {
      // Use the invoice payment page route
      finalPaymentLink = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/pay/invoice/${invoice_id}`;
    }

    // Generate invoice HTML
    const invoiceHtml = generateInvoiceEmailHTML({
      invoice,
      milestone,
      schedule,
      lead,
      job,
      paymentLink: finalPaymentLink,
    });

    // Send email
    try {
      await sendMail({
        to: lead.email,
        subject: `Invoice ${invoice.invoice_number} - ${milestone.label}`,
        html: invoiceHtml,
        from: process.env.FROM_EMAIL || "noreply@smartsendhq.com",
      });
    } catch (emailError: any) {
      console.error("Failed to send invoice email:", emailError);
      return NextResponse.json(
        { error: "Failed to send invoice email", details: emailError.message },
        { status: 500 }
      );
    }

    // Update invoice as sent
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        sent: true,
        sent_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("Failed to update invoice sent status:", updateError);
      // Don't fail the request, email was sent
    }

    return NextResponse.json({
      sent: true,
      sent_at: new Date().toISOString(),
      payment_link: finalPaymentLink,
    });
  } catch (error: any) {
    console.error("Error in send invoice:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Generate invoice email HTML
 */
function generateInvoiceEmailHTML({
  invoice,
  milestone,
  schedule,
  lead,
  job,
  paymentLink,
}: any): string {
  const homeownerName = lead
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : "Homeowner";
  const jobTitle = job?.title || "Roofing Job";
  const jobAddress = job?.address || "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .invoice-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .amount { font-size: 32px; font-weight: bold; color: #2563eb; text-align: center; margin: 30px 0; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Invoice ${invoice.invoice_number}</h1>
  </div>
  
  <div class="content">
    <p>Hi ${homeownerName},</p>
    
    <p>Your invoice for <strong>${milestone.label}</strong> is ready.</p>
    
    <div class="invoice-details">
      <p><strong>Job:</strong> ${jobTitle}</p>
      ${jobAddress ? `<p><strong>Address:</strong> ${jobAddress}</p>` : ""}
      <p><strong>Milestone:</strong> ${milestone.label}</p>
      ${milestone.due_date ? `<p><strong>Due Date:</strong> ${new Date(milestone.due_date).toLocaleDateString()}</p>` : ""}
    </div>
    
    <div class="amount">
      $${milestone.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </div>
    
    <div style="text-align: center;">
      <a href="${paymentLink}" class="button">Pay Now</a>
    </div>
    
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #2563eb;">${paymentLink}</p>
  </div>
  
  <div class="footer">
    <p>Thank you for your business!</p>
    <p>This is an automated invoice from SmartSend.</p>
  </div>
</body>
</html>
  `.trim();
}

























