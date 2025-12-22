import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/accounting/invoices/[id]/pdf
 * Generate invoice PDF (returns HTML that can be converted to PDF)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get invoice with all related data
    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(`
        *,
        jobs (
          id,
          stage,
          contract_value
        ),
        customers (
          id,
          name,
          email,
          phone,
          address,
          city,
          state,
          zip_code
        ),
        teams (
          id,
          name
        )
      `)
      .eq("id", id)
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", invoice.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Generate HTML invoice
    const html = generateInvoiceHTML(invoice);

    // Update invoice with PDF URL (if storing in S3/storage)
    // For now, we'll return HTML that can be converted to PDF client-side
    // or use a service like Resend's PDF API

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="invoice-${invoice.invoice_number}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

function generateInvoiceHTML(invoice: any): string {
  const customer = invoice.customers || {};
  const team = invoice.teams || {};
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];

  const customerName = customer.name || "Customer";
  const customerAddress = [
    customer.address,
    customer.city,
    customer.state,
    customer.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

  const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString();
  const dueDate = new Date(invoice.due_date).toLocaleDateString();

  const statusColors: Record<string, string> = {
    paid: "#10b981",
    partially_paid: "#f59e0b",
    unpaid: "#ef4444",
    overdue: "#dc2626",
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      padding: 40px;
      background: #f9fafb;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .invoice-number {
      font-size: 28px;
      font-weight: bold;
      color: #111827;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      background: ${statusColors[invoice.status] || "#6b7280"}20;
      color: ${statusColors[invoice.status] || "#6b7280"};
    }
    .company-info {
      margin-bottom: 30px;
    }
    .company-name {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .billing-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 40px;
    }
    .info-section h3 {
      font-size: 14px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 10px;
      letter-spacing: 0.5px;
    }
    .info-section p {
      margin: 4px 0;
      color: #374151;
    }
    .line-items {
      margin: 40px 0;
    }
    .line-items table {
      width: 100%;
      border-collapse: collapse;
    }
    .line-items th {
      text-align: left;
      padding: 12px;
      background: #f9fafb;
      border-bottom: 2px solid #e5e7eb;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
    }
    .line-items td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .line-items tr:last-child td {
      border-bottom: none;
    }
    .totals {
      margin-top: 30px;
      text-align: right;
    }
    .total-row {
      display: flex;
      justify-content: flex-end;
      padding: 8px 0;
    }
    .total-label {
      width: 150px;
      text-align: right;
      padding-right: 20px;
      color: #6b7280;
    }
    .total-value {
      width: 120px;
      text-align: right;
      font-weight: 500;
    }
    .total-row.grand-total {
      margin-top: 10px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
    }
    .grand-total .total-label {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
    }
    .grand-total .total-value {
      font-size: 24px;
      font-weight: bold;
      color: #111827;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    .payment-info {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-top: 30px;
    }
    .payment-info h4 {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
      color: #111827;
    }
    .payment-info p {
      font-size: 13px;
      color: #6b7280;
      margin: 4px 0;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div>
        <div class="invoice-number">Invoice ${invoice.invoice_number}</div>
        <div style="margin-top: 8px;">
          <span class="status-badge">${invoice.status.replace("_", " ")}</span>
        </div>
      </div>
      <div class="company-info">
        <div class="company-name">${team.name || "Company Name"}</div>
      </div>
    </div>

    <div class="billing-info">
      <div class="info-section">
        <h3>Bill To</h3>
        <p><strong>${customerName}</strong></p>
        ${customer.email ? `<p>${customer.email}</p>` : ""}
        ${customer.phone ? `<p>${customer.phone}</p>` : ""}
        ${customerAddress ? `<p>${customerAddress}</p>` : ""}
      </div>
      <div class="info-section">
        <h3>Invoice Details</h3>
        <p><strong>Invoice Date:</strong> ${invoiceDate}</p>
        <p><strong>Due Date:</strong> ${dueDate}</p>
        <p><strong>Type:</strong> ${invoice.invoice_type.replace("_", " ")}</p>
        ${invoice.jobs ? `<p><strong>Job ID:</strong> ${invoice.jobs.id}</p>` : ""}
      </div>
    </div>

    ${invoice.description ? `<div style="margin-bottom: 20px;"><p>${invoice.description}</p></div>` : ""}

    <div class="line-items">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th style="text-align: right;">Quantity</th>
            <th style="text-align: right;">Unit Price</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${
            lineItems.length > 0
              ? lineItems
                  .map(
                    (item: any) => `
            <tr>
              <td>${item.description || "Item"}</td>
              <td style="text-align: right;">${item.quantity || 1}</td>
              <td style="text-align: right;">$${parseFloat(item.unit_price || 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</td>
              <td style="text-align: right;">$${parseFloat(item.amount || 0).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}</td>
            </tr>
          `
                  )
                  .join("")
              : `
            <tr>
              <td colspan="4" style="text-align: center; padding: 20px; color: #6b7280;">
                ${invoice.description || "Invoice amount"}
              </td>
            </tr>
          `
          }
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="total-row">
        <div class="total-label">Subtotal:</div>
        <div class="total-value">$${parseFloat(invoice.amount || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
      </div>
      ${parseFloat(invoice.tax_amount || 0) > 0 ? `
      <div class="total-row">
        <div class="total-label">Tax:</div>
        <div class="total-value">$${parseFloat(invoice.tax_amount || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
      </div>
      ` : ""}
      <div class="total-row grand-total">
        <div class="total-label">Total:</div>
        <div class="total-value">$${parseFloat(invoice.total_amount || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
      </div>
      ${parseFloat(invoice.paid_amount || 0) > 0 ? `
      <div class="total-row">
        <div class="total-label">Paid:</div>
        <div class="total-value">$${parseFloat(invoice.paid_amount || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
      </div>
      <div class="total-row">
        <div class="total-label">Balance Due:</div>
        <div class="total-value">$${parseFloat(invoice.remaining_balance || 0).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}</div>
      </div>
      ` : ""}
    </div>

    ${invoice.notes ? `
    <div class="payment-info">
      <h4>Notes</h4>
      <p>${invoice.notes}</p>
    </div>
    ` : ""}

    <div class="footer">
      <p>Thank you for your business!</p>
      <p style="margin-top: 8px;">This invoice was generated by SmartSend</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
