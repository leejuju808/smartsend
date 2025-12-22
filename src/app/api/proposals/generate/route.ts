// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Generate Proposal from Estimate
// POST /api/proposals/generate

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
      estimate_id,
      theme = "classic",
      photos = [],
      valid_until,
    } = body;

    if (!estimate_id) {
      return NextResponse.json(
        { error: "estimate_id is required" },
        { status: 400 }
      );
    }

    // Get estimate with company info
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select(`
        *,
        company:roofing_companies(*),
        homeowner:homeowners(*)
      `)
      .eq("id", estimate_id)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    // Verify user owns the company
    if (estimate.company?.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Generate proposal HTML
    const proposalHtml = generateProposalHTML(estimate, theme);

    // Create proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("estimates_proposals")
      .insert({
        estimate_id,
        proposal_html: proposalHtml,
        theme,
        photos: Array.isArray(photos) ? photos : [],
        valid_until: valid_until ? new Date(valid_until).toISOString().split('T')[0] : null,
        status: "pending",
      })
      .select()
      .single();

    if (proposalError) {
      console.error("Error creating proposal:", proposalError);
      return NextResponse.json(
        { error: "Failed to create proposal", details: proposalError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      proposal,
      public_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsendhq.com'}/proposals/${proposal.public_token}`,
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/generate:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Generate proposal HTML from estimate
function generateProposalHTML(estimate: any, theme: string): string {
  const company = estimate.company || {};
  const homeowner = estimate.homeowner || {};
  const lineItems = Array.isArray(estimate.line_items) ? estimate.line_items : [];

  const themeStyles = {
    classic: {
      primary: "#1a1a1a",
      secondary: "#666",
      accent: "#007bff",
    },
    premium: {
      primary: "#2c3e50",
      secondary: "#7f8c8d",
      accent: "#e74c3c",
    },
    insurance: {
      primary: "#003366",
      secondary: "#4a90a4",
      accent: "#00a8e8",
    },
  };

  const colors = themeStyles[theme as keyof typeof themeStyles] || themeStyles.classic;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roofing Proposal - ${company.name || 'SmartSend'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: ${colors.primary};
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
      border-bottom: 3px solid ${colors.accent};
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .company-name {
      font-size: 28px;
      font-weight: bold;
      color: ${colors.primary};
      margin-bottom: 10px;
    }
    .proposal-title {
      font-size: 24px;
      color: ${colors.secondary};
      margin-top: 10px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      font-weight: bold;
      color: ${colors.primary};
      margin-bottom: 15px;
      border-left: 4px solid ${colors.accent};
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
      color: ${colors.secondary};
    }
    .info-value {
      color: ${colors.primary};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th {
      background: ${colors.primary};
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
      border-top: 2px solid ${colors.accent};
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
      color: ${colors.accent};
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      text-align: center;
      color: ${colors.secondary};
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-name">${company.name || 'Roofing Company'}</div>
      <div class="proposal-title">Professional Roofing Proposal</div>
    </div>

    <div class="section">
      <div class="section-title">Homeowner Information</div>
      <div class="info-row">
        <span class="info-label">Name:</span>
        <span class="info-value">${homeowner.name || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${homeowner.email || 'N/A'}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Scope of Work</div>
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
          <span class="total-label">Total:</span>
          <span class="total-value">$${parseFloat(estimate.total || 0).toFixed(2)}</span>
        </div>
      </div>
    </div>

    ${estimate.notes ? `
    <div class="section">
      <div class="section-title">Notes</div>
      <p>${estimate.notes}</p>
    </div>
    ` : ''}

    <div class="footer">
      <p>This proposal is valid until ${estimate.valid_until ? new Date(estimate.valid_until).toLocaleDateString() : 'further notice'}</p>
      <p>Generated by SmartSend Roofing</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
