// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Convert Proposal to Contract
// POST /api/contracts/create

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      proposal_id,
      terms_and_conditions,
      scope_of_work,
      payment_schedule = [],
      warranty,
      insurance_docs = [],
    } = body;

    if (!proposal_id) {
      return NextResponse.json(
        { error: "proposal_id is required" },
        { status: 400 }
      );
    }

    // Get proposal with estimate and company info
    const { data: proposal, error: proposalError } = await supabase
      .from("estimates_proposals")
      .select(`
        *,
        estimate:estimates(
          *,
          company:roofing_companies(*),
          homeowner:homeowners(*)
        )
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Verify user owns the company
    if (proposal.estimate?.company?.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Generate contract HTML
    const contractHtml = generateContractHTML(proposal, {
      terms_and_conditions,
      scope_of_work,
      payment_schedule,
      warranty,
    });

    // Create contract
    const { data: contract, error: contractError } = await supabase
      .from("estimates_contracts")
      .insert({
        proposal_id,
        contract_html: contractHtml,
        terms_and_conditions: terms_and_conditions || null,
        scope_of_work: scope_of_work || null,
        payment_schedule: Array.isArray(payment_schedule) ? payment_schedule : [],
        warranty: warranty || null,
        insurance_docs: Array.isArray(insurance_docs) ? insurance_docs : [],
        requires_signature: true,
        status: "awaiting_signature",
      })
      .select()
      .single();

    if (contractError) {
      console.error("Error creating contract:", contractError);
      return NextResponse.json(
        { error: "Failed to create contract", details: contractError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      contract,
      public_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/contracts/${contract.public_token}`,
    });
  } catch (error: any) {
    console.error("Error in /api/contracts/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Generate contract HTML from proposal
function generateContractHTML(proposal: any, contractData: any): string {
  const estimate = proposal.estimate || {};
  const company = estimate.company || {};
  const homeowner = estimate.homeowner || {};
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roofing Contract - ${company.name || 'SmartSend'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #007bff;
      padding-bottom: 20px;
      margin-bottom: 30px;
      text-align: center;
    }
    .contract-title {
      font-size: 28px;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 10px;
    }
    .company-name {
      font-size: 20px;
      color: #666;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      font-weight: bold;
      color: #1a1a1a;
      margin-bottom: 15px;
      border-left: 4px solid #007bff;
      padding-left: 10px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    .info-label {
      font-weight: 600;
      color: #666;
    }
    .info-value {
      color: #1a1a1a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background: #1a1a1a;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #eee;
    }
    .text-right {
      text-align: right;
    }
    .totals {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px solid #007bff;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      font-size: 16px;
    }
    .total-label {
      font-weight: 600;
    }
    .total-value {
      font-weight: bold;
      font-size: 20px;
      color: #007bff;
    }
    .legal-text {
      font-size: 12px;
      color: #666;
      line-height: 1.8;
      margin-top: 30px;
      padding-top: 30px;
      border-top: 1px solid #eee;
    }
    .signature-section {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 2px solid #007bff;
    }
    .signature-box {
      margin-top: 30px;
      padding: 20px;
      border: 2px dashed #ccc;
      min-height: 150px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="contract-title">ROOFING CONTRACT</div>
      <div class="company-name">${company.name || 'Roofing Company'}</div>
    </div>

    <div class="section">
      <div class="section-title">Parties</div>
      <div class="info-row">
        <span class="info-label">Contractor:</span>
        <span class="info-value">${company.name || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Homeowner:</span>
        <span class="info-value">${homeowner.name || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${homeowner.email || 'N/A'}</span>
      </div>
    </div>

    ${contractData.scope_of_work ? `
    <div class="section">
      <div class="section-title">Scope of Work</div>
      <p>${contractData.scope_of_work}</p>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">Work Details</div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item: any) => `
            <tr>
              <td>${item.material || item.description || 'Item'}</td>
              <td>${item.quantity || 1}</td>
              <td>$${parseFloat(item.unit_price || 0).toFixed(2)}</td>
              <td class="text-right">$${parseFloat(item.total || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="totals">
        <div class="total-row">
          <span class="total-label">Subtotal:</span>
          <span class="total-value">$${parseFloat(estimate.subtotal || 0).toFixed(2)}</span>
        </div>
        ${estimate.tax > 0 ? `
        <div class="total-row">
          <span class="total-label">Tax (${(parseFloat(estimate.tax_rate || 0) * 100).toFixed(2)}%):</span>
          <span class="total-value">$${parseFloat(estimate.tax || 0).toFixed(2)}</span>
        </div>
        ` : ''}
        <div class="total-row">
          <span class="total-label">Total Contract Amount:</span>
          <span class="total-value">$${parseFloat(estimate.total || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>

    ${Array.isArray(contractData.payment_schedule) && contractData.payment_schedule.length > 0 ? `
    <div class="section">
      <div class="section-title">Payment Schedule</div>
      <table>
        <thead>
          <tr>
            <th>Milestone</th>
            <th>Amount</th>
            <th>Due Date</th>
          </tr>
        </thead>
        <tbody>
          ${contractData.payment_schedule.map((payment: any) => `
            <tr>
              <td>${payment.milestone || 'Payment'}</td>
              <td>$${parseFloat(payment.amount || 0).toFixed(2)}</td>
              <td>${payment.due_date || 'TBD'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${contractData.warranty ? `
    <div class="section">
      <div class="section-title">Warranty</div>
      <p>${contractData.warranty}</p>
    </div>
    ` : ''}

    ${contractData.terms_and_conditions ? `
    <div class="section">
      <div class="section-title">Terms and Conditions</div>
      <div class="legal-text">${contractData.terms_and_conditions}</div>
    </div>
    ` : ''}

    <div class="signature-section">
      <div class="section-title">Signatures</div>
      <p>By signing below, both parties agree to the terms and conditions outlined in this contract.</p>
      <div class="signature-box">
        <p><strong>Homeowner Signature:</strong></p>
        <p style="margin-top: 20px;">_________________________</p>
        <p style="margin-top: 10px;">Date: _______________</p>
      </div>
      <div class="signature-box" style="margin-top: 20px;">
        <p><strong>Contractor Signature:</strong></p>
        <p style="margin-top: 20px;">_________________________</p>
        <p style="margin-top: 10px;">Date: _______________</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

























