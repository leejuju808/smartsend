// Block 254300 — SmartSend Sales Acceleration Engine v1
// Proposal Auto-Builder (PDF Generator)
// POST /api/sales/proposals/generate

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ProposalRequest {
  org_id: string;
  estimate_id: string;
  lead_id: string;
  company_name?: string;
  company_logo_url?: string;
  company_phone?: string;
  company_email?: string;
  company_address?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ProposalRequest = await req.json();
    const { org_id, estimate_id, lead_id, company_name, company_logo_url, company_phone, company_email, company_address } = body;

    // Get estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select("*")
      .eq("id", estimate_id)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
    }

    // Get lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get company info if available
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("*")
      .eq("org_id", org_id)
      .eq("is_active", true)
      .limit(1)
      .single();

    // Authority Loop v1: contractor_profile is the canonical place for company_name + service_area
    let contractorProfile: { company_name: string | null; logo_url: string | null; service_area: string | null } | null = null;
    try {
      const workspaceId = (company as any)?.workspace_id || (estimate as any)?.workspace_id || null;
      if (workspaceId) {
        const { data } = await supabase
          .from("contractor_profile")
          .select("company_name, logo_url, service_area")
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        contractorProfile = (data as any) ?? null;
      }
    } catch {
      contractorProfile = null;
    }

    const effectiveCompany = company
      ? {
          ...(company as any),
          name: contractorProfile?.company_name || (company as any).name || company_name || "Your Roofing Company",
          logo_url: contractorProfile?.logo_url || (company as any).logo_url || company_logo_url,
          service_area: contractorProfile?.service_area || null,
        }
      : {
          name: contractorProfile?.company_name || company_name || "Your Roofing Company",
          logo_url: contractorProfile?.logo_url || company_logo_url,
          phone: company_phone,
          email: company_email,
          address: company_address,
          service_area: contractorProfile?.service_area || null,
        };

    // Generate PDF HTML (client-side can convert to PDF using libraries)
    const proposalHTML = generateProposalHTML({
      estimate,
      lead,
      company: effectiveCompany,
    });

    // Save proposal record
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        org_id,
        estimate_id,
        lead_id,
        pdf_path: `proposals/${org_id}/${estimate_id}.html`, // Store HTML path
        metadata: {
          company_name: company?.name || company_name,
          generated_at: new Date().toISOString(),
        },
        sent: false,
      })
      .select()
      .single();

    if (proposalError) {
      console.error("Error saving proposal:", proposalError);
      return NextResponse.json(
        { error: "Failed to save proposal" },
        { status: 500 }
      );
    }

    // Optionally upload to storage (if needed)
    // const { error: uploadError } = await supabaseAdmin.storage
    //   .from("proposals")
    //   .upload(`proposals/${org_id}/${estimate_id}.html`, proposalHTML, {
    //     contentType: "text/html",
    //   });

    return NextResponse.json({
      success: true,
      proposal: {
        id: proposal.id,
        html: proposalHTML,
        pdf_path: proposal.pdf_path,
      },
    });
  } catch (error: any) {
    console.error("Error generating proposal:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateProposalHTML(data: any): string {
  const { estimate, lead, company } = data;
  const breakdown = estimate.breakdown || {};
  const lineItems = breakdown.line_items || [];
  const serviceArea = (company?.service_area || "").trim();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roofing Proposal - ${lead.customer_name || lead.first_name || "Customer"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #fff;
    }
    .container { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .logo { max-height: 60px; }
    .company-info { text-align: right; }
    .company-name { font-size: 24px; font-weight: bold; color: #111; margin-bottom: 8px; }
    .company-details { font-size: 14px; color: #666; }
    .proposal-title {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 10px;
      color: #111;
    }
    .proposal-date { color: #666; margin-bottom: 40px; }
    .section { margin-bottom: 40px; }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 20px;
      color: #111;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
    }
    .customer-info {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    .info-row { margin-bottom: 8px; }
    .info-label { font-weight: 600; color: #555; }
    .scope-list {
      list-style: none;
      padding-left: 0;
    }
    .scope-list li {
      padding: 10px 0;
      border-bottom: 1px solid #e5e7eb;
      position: relative;
      padding-left: 30px;
    }
    .scope-list li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #10b981;
      font-weight: bold;
    }
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    .pricing-table th,
    .pricing-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .pricing-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #555;
    }
    .pricing-table .total-row {
      font-weight: bold;
      font-size: 18px;
      background: #f9fafb;
    }
    .total-price {
      font-size: 36px;
      font-weight: bold;
      color: #111;
      text-align: center;
      margin: 30px 0;
      padding: 20px;
      background: #f0fdf4;
      border: 2px solid #10b981;
      border-radius: 8px;
    }
    .warranty-section {
      background: #eff6ff;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
      margin: 30px 0;
    }
    .authority-section {
      background: #f9fafb;
      padding: 18px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      margin: 30px 0;
    }
    .authority-title { font-weight: 700; margin-bottom: 10px; color: #111; }
    .authority-list { margin: 0; padding-left: 18px; color: #374151; }
    .authority-list li { margin: 6px 0; }
    .signature-section {
      margin-top: 60px;
      padding-top: 40px;
      border-top: 2px solid #e5e7eb;
    }
    .signature-line {
      margin-top: 60px;
      border-top: 1px solid #333;
      width: 300px;
      padding-top: 10px;
    }
    .footer {
      margin-top: 60px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        ${company.logo_url ? `<img src="${company.logo_url}" alt="${company.name}" class="logo">` : ""}
      </div>
      <div class="company-info">
        <div class="company-name">${company.name || "Your Roofing Company"}</div>
        <div class="company-details">
          ${company.phone ? `<div>${company.phone}</div>` : ""}
          ${company.email ? `<div>${company.email}</div>` : ""}
          ${company.address ? `<div>${company.address}</div>` : ""}
        </div>
      </div>
    </div>

    <h1 class="proposal-title">Roofing Proposal</h1>
    <div class="proposal-date">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>

    <div class="section">
      <div class="customer-info">
        <div class="info-row">
          <span class="info-label">Customer:</span> ${lead.customer_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Customer"}
        </div>
        ${lead.address ? `<div class="info-row"><span class="info-label">Address:</span> ${lead.address}</div>` : ""}
        ${lead.email ? `<div class="info-row"><span class="info-label">Email:</span> ${lead.email}</div>` : ""}
        ${lead.phone ? `<div class="info-row"><span class="info-label">Phone:</span> ${lead.phone}</div>` : ""}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Scope of Work</h2>
      <ul class="scope-list">
        <li>Tear off all existing shingles (${estimate.squares} squares)</li>
        <li>Install synthetic underlayment</li>
        <li>Install drip edge around entire perimeter</li>
        <li>Install ${estimate.material_system?.replace(/_/g, " ") || "architectural shingles"}</li>
        <li>Replace pipe boots</li>
        <li>Install ridge vent system</li>
        <li>Clean up and dispose of all debris</li>
        <li>Final inspection and walkthrough</li>
      </ul>
    </div>

    <div class="section">
      <h2 class="section-title">Materials & Pricing</h2>
      <table class="pricing-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Cost</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map(
            (item: any) => `
          <tr>
            <td>${item.description || ""}</td>
            <td>${item.quantity || 0} ${item.unit || ""}</td>
            <td>$${item.unit_cost?.toFixed(2) || "0.00"}</td>
            <td>$${item.total?.toFixed(2) || "0.00"}</td>
          </tr>
          `
          ).join("")}
          <tr class="total-row">
            <td colspan="3" style="text-align: right;">Total:</td>
            <td>$${estimate.price?.toFixed(2) || "0.00"}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="total-price">
      Total: $${estimate.price?.toFixed(2) || "0.00"}
    </div>

    <div class="section">
      <h2 class="section-title">Warranty</h2>
      <div class="warranty-section">
        <p><strong>Material Warranty:</strong> 30-year manufacturer warranty on shingles</p>
        <p><strong>Workmanship Warranty:</strong> 5-year warranty on installation</p>
        <p>All work is fully insured and licensed. We stand behind our work and will address any issues that arise from our installation.</p>
      </div>
    </div>

    <div class="section">
      <div class="authority-section">
        <div class="authority-title">Why Homeowners Choose ${company.name || "us"}</div>
        <ul class="authority-list">
          <li>Local roofing professionals serving ${serviceArea || "your area"}</li>
          <li>Clear pricing, no surprises</li>
          <li>Workmanship-backed warranty</li>
          <li>Fast scheduling and clean job sites</li>
        </ul>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Optional Upgrades</h2>
      <ul class="scope-list">
        <li>Premium architectural shingles - Add $${(estimate.squares * 50).toFixed(2)}</li>
        <li>Gutter guard system - Add $${(estimate.squares * 20).toFixed(2)}</li>
        <li>Solar-ready preparation - Add $${(estimate.squares * 30).toFixed(2)}</li>
      </ul>
    </div>

    <div class="signature-section">
      <p>By signing below, you agree to the terms and pricing outlined in this proposal.</p>
      <div style="margin-top: 40px;">
        <div class="signature-line">
          <div style="margin-bottom: 5px;">Customer Signature</div>
        </div>
        <div style="margin-top: 20px;">
          <div style="margin-bottom: 5px;">Date: _______________</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for considering ${company.name || "us"} for your roofing needs.</p>
      <p>This proposal is valid for 30 days from the date above.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}






















