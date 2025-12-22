import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/invoices/create
 * Generates an invoice for a payment milestone
 * 
 * Input: { milestone_id, invoice_number (optional) }
 * Output: { invoice_id, invoice, invoice_html }
 */
export async function POST(req: NextRequest) {
  try {
    const { milestone_id, invoice_number } = await req.json();

    if (!milestone_id) {
      return NextResponse.json(
        { error: "milestone_id is required" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Fetch milestone details
    const { data: milestone, error: milestoneError } = await supabase
      .from("payment_milestones")
      .select(`
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
      `)
      .eq("id", milestone_id)
      .single();

    if (milestoneError || !milestone) {
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

    // Generate invoice number if not provided
    let finalInvoiceNumber = invoice_number;
    if (!finalInvoiceNumber) {
      const { data: invoiceCount } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", schedule.workspace_id);

      const count = invoiceCount ? (invoiceCount as any).length || 0 : 0;
      finalInvoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;
    }

    // Get lead/homeowner info
    const contract = schedule.contract_documents;
    const lead = contract?.leads;
    const job = schedule.roofing_jobs;

    // Generate invoice HTML (simple template - can be enhanced)
    const invoiceHtml = generateInvoiceHTML({
      invoiceNumber: finalInvoiceNumber,
      milestone,
      schedule,
      lead,
      job,
      company: null, // TODO: Get company info from workspace
    });

    // Create invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        milestone_id: milestone_id,
        schedule_id: schedule.id,
        job_id: schedule.job_id,
        workspace_id: schedule.workspace_id,
        lead_id: schedule.lead_id,
        invoice_number: finalInvoiceNumber,
        type: milestone.label.toLowerCase().includes("deposit")
          ? "deposit"
          : milestone.label.toLowerCase().includes("final")
          ? "final"
          : "progress",
        amount: milestone.amount,
        due_date: milestone.due_date,
        status: "pending",
        notes: `Invoice for ${milestone.label}`,
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error("Error creating invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create invoice", details: invoiceError?.message },
        { status: 500 }
      );
    }

    // Update invoice with HTML (if there's a column for it)
    // Note: You may need to add invoice_html column to invoices table
    // For now, we'll return it in the response

    return NextResponse.json({
      invoice_id: invoice.id,
      invoice,
      invoice_html: invoiceHtml,
    });
  } catch (error: any) {
    console.error("Error in create invoice:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Generate invoice HTML template
 */
function generateInvoiceHTML({
  invoiceNumber,
  milestone,
  schedule,
  lead,
  job,
  company,
}: any): string {
  const homeownerName = lead
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : "Homeowner";
  const homeownerEmail = lead?.email || "";
  const jobAddress = job?.address || "";
  const jobTitle = job?.title || "Roofing Job";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoiceNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
    .invoice-number { font-size: 24px; font-weight: bold; }
    .details { margin: 20px 0; }
    .detail-row { margin: 10px 0; }
    .amount { font-size: 32px; font-weight: bold; color: #2563eb; margin: 30px 0; }
    .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="invoice-number">Invoice ${invoiceNumber}</div>
    <div class="detail-row">Date: ${new Date().toLocaleDateString()}</div>
  </div>
  
  <div class="details">
    <div class="detail-row"><strong>Bill To:</strong></div>
    <div class="detail-row">${homeownerName}</div>
    ${homeownerEmail ? `<div class="detail-row">${homeownerEmail}</div>` : ""}
    ${jobAddress ? `<div class="detail-row">${jobAddress}</div>` : ""}
  </div>
  
  <div class="details">
    <div class="detail-row"><strong>Job:</strong> ${jobTitle}</div>
    <div class="detail-row"><strong>Payment Milestone:</strong> ${milestone.label}</div>
    ${milestone.due_date ? `<div class="detail-row"><strong>Due Date:</strong> ${new Date(milestone.due_date).toLocaleDateString()}</div>` : ""}
  </div>
  
  <div class="amount">
    Amount Due: $${milestone.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  </div>
  
  <div class="footer">
    <p>Thank you for your business. Please pay this invoice by the due date.</p>
    <p>This is an automated invoice from SmartSend.</p>
  </div>
</body>
</html>
  `.trim();
}
