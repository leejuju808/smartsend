// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// API Route: Convert Proposal to Contract
// POST /api/proposals/[id]/contract

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

    const body = await req.json();
    const { contract_type = "standard" } = body;

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        leads:lead_id (*),
        jobs:job_id (*)
      `)
      .eq("id", id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Generate contract content from proposal
    const contractContent = generateContractFromProposal(proposal, contract_type);

    // For now, we'll store the contract content
    // In production, you'd generate a PDF here using a service like Puppeteer, @react-pdf/renderer, or PDFShift
    const contractHtml = generateContractHTML(contractContent, proposal);

    // Create contract document record
    const { data: contract, error: contractError } = await supabase
      .from("contract_documents")
      .insert({
        proposal_id: id,
        lead_id: proposal.lead_id,
        job_id: proposal.job_id,
        contract_type,
        status: "draft",
        pdf_url: null, // Will be set when PDF is generated
      })
      .select()
      .single();

    if (contractError) {
      console.error("Error creating contract:", contractError);
      return NextResponse.json(
        { error: "Failed to create contract" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      contract,
      html_content: contractHtml, // Return HTML for now, client can convert to PDF
      message: "Contract created successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/proposals/[id]/contract:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateContractFromProposal(proposal: any, contractType: string): any {
  const lead = proposal.leads || {};
  
  return {
    contractor_name: "Your Company Name", // Get from workspace/profile
    contractor_address: "Your Address",
    contractor_phone: "Your Phone",
    contractor_email: "Your Email",
    homeowner_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
    homeowner_address: lead.address || lead.custom?.address || "",
    homeowner_email: lead.email || "",
    homeowner_phone: lead.phone || "",
    project_description: proposal.content || proposal.title || "",
    contract_price: proposal.price || 0,
    payment_terms: "50% deposit upon signing, 50% upon completion",
    warranty_details: proposal.warranty_details || {},
    cancellation_rights: "Homeowner may cancel within 3 business days of signing",
    insurance_language: contractType === "insurance" ? "This contract is subject to insurance approval." : "",
    storm_language: contractType === "storm" ? "This work is related to storm damage and may be covered by insurance." : "",
    effective_date: new Date().toISOString().split('T')[0],
    signatures: {
      contractor_signed: false,
      homeowner_signed: false,
    },
  };
}

function generateContractHTML(contract: any, proposal: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Roofing Contract</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
    h1 { text-align: center; color: #333; }
    h2 { color: #555; border-bottom: 2px solid #ddd; padding-bottom: 10px; }
    .section { margin: 30px 0; }
    .signature-section { margin-top: 60px; page-break-inside: avoid; }
    .signature-line { border-top: 1px solid #000; width: 300px; margin: 60px 0 10px 0; }
    .terms { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>ROOFING CONTRACT</h1>
  
  <div class="section">
    <h2>Contractor Information</h2>
    <p><strong>Name:</strong> ${contract.contractor_name}</p>
    <p><strong>Address:</strong> ${contract.contractor_address}</p>
    <p><strong>Phone:</strong> ${contract.contractor_phone}</p>
    <p><strong>Email:</strong> ${contract.contractor_email}</p>
  </div>

  <div class="section">
    <h2>Homeowner Information</h2>
    <p><strong>Name:</strong> ${contract.homeowner_name}</p>
    <p><strong>Address:</strong> ${contract.homeowner_address}</p>
    <p><strong>Phone:</strong> ${contract.homeowner_phone}</p>
    <p><strong>Email:</strong> ${contract.homeowner_email}</p>
  </div>

  <div class="section">
    <h2>Project Description</h2>
    <p>${contract.project_description}</p>
  </div>

  <div class="section">
    <h2>Contract Price</h2>
    <p><strong>Total Amount:</strong> $${contract.contract_price.toLocaleString()}</p>
    <p><strong>Payment Terms:</strong> ${contract.payment_terms}</p>
  </div>

  ${contract.insurance_language ? `<div class="section"><p><strong>Insurance Notice:</strong> ${contract.insurance_language}</p></div>` : ''}
  ${contract.storm_language ? `<div class="section"><p><strong>Storm Damage Notice:</strong> ${contract.storm_language}</p></div>` : ''}

  <div class="section terms">
    <h2>Terms and Conditions</h2>
    <p><strong>Cancellation Rights:</strong> ${contract.cancellation_rights}</p>
    <p><strong>Warranty:</strong> See attached warranty details.</p>
    <p><strong>Effective Date:</strong> ${contract.effective_date}</p>
  </div>

  <div class="signature-section">
    <h2>Signatures</h2>
    <div>
      <p><strong>Contractor:</strong></p>
      <div class="signature-line"></div>
      <p>Date: _______________</p>
    </div>
    <div style="margin-top: 40px;">
      <p><strong>Homeowner:</strong></p>
      <div class="signature-line"></div>
      <p>Date: _______________</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

































