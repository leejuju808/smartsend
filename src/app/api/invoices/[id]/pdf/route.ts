// Block 39200 — SmartSend Roofing Invoice Engine
// GET /api/invoices/[id]/pdf
// Generate and return invoice PDF

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    // Get invoice with all related data
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select(`
        id,
        invoice_number,
        amount,
        balance_due,
        due_date,
        status,
        type,
        created_at,
        notes,
        roofing_job_id,
        lead_id,
        workspace_id,
        roofing_jobs:roofing_job_id (
          id,
          title,
          job_value
        ),
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          company
        ),
        invoice_line_items (
          id,
          description,
          quantity,
          unit_price,
          total
        ),
        workspaces:workspace_id (
          id,
          name,
          settings
        )
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // If user is authenticated, verify access
    if (user) {
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .eq("workspace_id", invoice.workspace_id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get payments
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false });

    // Get change orders if any
    const { data: changeOrders } = invoice.roofing_job_id
      ? await supabaseAdmin
          .from("roofing_change_order_revenue")
          .select("amount")
          .eq("job_id", invoice.roofing_job_id)
          .eq("approved", true)
      : { data: null };

    // Generate PDF HTML (simple template)
    const workspace = invoice.workspaces as any;
    const lead = invoice.leads as any;
    const job = invoice.roofing_jobs as any;
    const lineItems = invoice.invoice_line_items as any[];

    const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
    const changeOrderTotal = changeOrders?.reduce((sum, co) => sum + Number(co.amount || 0), 0) || 0;

    const pdfHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; }
    .header { margin-bottom: 30px; }
    .company-name { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
    .invoice-title { font-size: 32px; font-weight: bold; margin: 20px 0; }
    .invoice-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .info-block { flex: 1; }
    .info-label { font-weight: bold; margin-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; font-weight: bold; }
    .text-right { text-align: right; }
    .totals { margin-top: 30px; float: right; width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .total-row.final { font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }
    .payment-link { margin-top: 30px; padding: 15px; background: #f0f0f0; text-align: center; }
    .footer { margin-top: 50px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${workspace?.name || "SmartSend Roofing"}</div>
    <div>Invoice</div>
  </div>
  
  <div class="invoice-title">INVOICE</div>
  
  <div class="invoice-info">
    <div class="info-block">
      <div class="info-label">Bill To:</div>
      <div>${lead?.first_name || ""} ${lead?.last_name || ""}</div>
      ${lead?.company ? `<div>${lead.company}</div>` : ""}
      ${lead?.email ? `<div>${lead.email}</div>` : ""}
      ${lead?.phone ? `<div>${lead.phone}</div>` : ""}
    </div>
    <div class="info-block">
      <div class="info-label">Invoice #:</div>
      <div>${invoice.invoice_number}</div>
      <div class="info-label" style="margin-top: 15px;">Date:</div>
      <div>${new Date(invoice.created_at).toLocaleDateString()}</div>
      <div class="info-label" style="margin-top: 15px;">Due Date:</div>
      <div>${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}</div>
    </div>
  </div>
  
  ${job ? `<div style="margin-bottom: 20px;"><strong>Job:</strong> ${job.title || "N/A"}</div>` : ""}
  
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Quantity</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems && lineItems.length > 0
        ? lineItems
            .map(
              (item) => `
        <tr>
          <td>${item.description}</td>
          <td class="text-right">${item.quantity || 1}</td>
          <td class="text-right">$${Number(item.unit_price || 0).toFixed(2)}</td>
          <td class="text-right">$${Number(item.total || 0).toFixed(2)}</td>
        </tr>
      `
            )
            .join("")
        : `
        <tr>
          <td>${job?.title || "Roofing Services"}</td>
          <td class="text-right">1</td>
          <td class="text-right">$${Number(invoice.amount || 0).toFixed(2)}</td>
          <td class="text-right">$${Number(invoice.amount || 0).toFixed(2)}</td>
        </tr>
      `}
      ${changeOrderTotal > 0
        ? `
        <tr>
          <td>Change Orders</td>
          <td class="text-right">-</td>
          <td class="text-right">-</td>
          <td class="text-right">$${changeOrderTotal.toFixed(2)}</td>
        </tr>
      `
        : ""}
    </tbody>
  </table>
  
  <div class="totals">
    <div class="total-row">
      <span>Subtotal:</span>
      <span>$${Number(invoice.amount || 0).toFixed(2)}</span>
    </div>
    ${totalPaid > 0
      ? `
    <div class="total-row">
      <span>Amount Paid:</span>
      <span>$${totalPaid.toFixed(2)}</span>
    </div>
    `
      : ""}
    <div class="total-row final">
      <span>Balance Due:</span>
      <span>$${Number(invoice.balance_due || 0).toFixed(2)}</span>
    </div>
  </div>
  
  ${invoice.balance_due > 0
    ? `
  <div class="payment-link">
    <strong>Pay Online:</strong><br>
    ${process.env.NEXT_PUBLIC_SITE_URL || ""}/pay/${invoice.id}
  </div>
  `
    : ""}
  
  ${invoice.notes ? `<div style="margin-top: 30px;"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}
  
  <div class="footer">
    <p>Thank you for your business!</p>
    <p>This is an automated invoice from SmartSend Roofing.</p>
  </div>
</body>
</html>
    `.trim();

    // For now, return HTML (can be converted to PDF using a service like Puppeteer, PDFKit, or a cloud service)
    // Store PDF URL in database if needed
    const pdfUrl = `/api/invoices/${invoiceId}/pdf/html`;

    // Update invoice with PDF URL if not set
    if (!invoice.pdf_url) {
      await supabaseAdmin
        .from("invoices")
        .update({ pdf_url: pdfUrl })
        .eq("id", invoiceId);
    }

    // Return HTML (can be converted to PDF later)
    return new NextResponse(pdfHtml, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="invoice-${invoice.invoice_number}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































