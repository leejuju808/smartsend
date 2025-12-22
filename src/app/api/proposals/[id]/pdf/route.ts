// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// API Route: Generate Proposal PDF
// GET /api/proposals/[id]/pdf

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address_line1,
          city,
          state,
          zip_code
        )
      `)
      .eq("id", id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Generate HTML for PDF (can be converted to PDF using browser print or a service)
    const htmlContent = generateProposalPDFHTML(proposal);

    // For now, return HTML (can be converted to PDF using Puppeteer, @react-pdf/renderer, etc.)
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="proposal-${id}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/[id]/pdf:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateProposalPDFHTML(proposal: any): string {
  const lead = proposal.leads || {};
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Roofing Proposal - ${lead.first_name} ${lead.last_name}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #333;
    }
    .header {
      border-bottom: 2px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #2563eb;
      margin: 0;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #1f2937;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .price-summary {
      background: #eff6ff;
      border: 2px solid #2563eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 30px 0;
    }
    .price-summary .amount {
      font-size: 36px;
      font-weight: bold;
      color: #2563eb;
      margin: 10px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    table th, table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    table th {
      background: #f9fafb;
      font-weight: 600;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Roofing Proposal</h1>
    <p>${lead.first_name} ${lead.last_name}</p>
    <p>${lead.address_line1 || ""} ${lead.city || ""}, ${lead.state || ""} ${lead.zip_code || ""}</p>
  </div>

  ${proposal.html_content || "<p>Proposal content not available.</p>"}

  ${proposal.price ? `
  <div class="price-summary">
    <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">Total Proposal Amount</div>
    <div class="amount">$${proposal.price.toLocaleString()}</div>
  </div>
  ` : ""}

  ${proposal.warranty_details ? `
  <div class="section">
    <h2>Warranty Information</h2>
    <p><strong>Workmanship Warranty:</strong> ${proposal.warranty_details.workmanship_years || "N/A"} years</p>
    <p><strong>Material Warranty:</strong> ${proposal.warranty_details.material_years || "N/A"} years</p>
  </div>
  ` : ""}

  ${proposal.estimated_start_date ? `
  <div class="section">
    <h2>Estimated Timeline</h2>
    <p><strong>Estimated Start Date:</strong> ${new Date(proposal.estimated_start_date).toLocaleDateString()}</p>
  </div>
  ` : ""}

  <div class="footer">
    <p>This proposal was generated on ${new Date(proposal.created_at).toLocaleDateString()}</p>
    ${proposal.status === "signed" ? `<p><strong>Signed:</strong> ${new Date(proposal.signed_at).toLocaleDateString()}</p>` : ""}
  </div>
</body>
</html>
  `;
}
































