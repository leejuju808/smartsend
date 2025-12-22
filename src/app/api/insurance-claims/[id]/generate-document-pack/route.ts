// Block 255100 — SmartSend AI Insurance Claim Engine v1
// API Route: Generate Claim Document Pack PDF
// POST /api/insurance-claims/[id]/generate-document-pack

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: claimId } = await params;

    // Get claim with all related data
    const { data: claim, error: claimError } = await serviceSupabase
      .from('insurance_claims')
      .select(`
        *,
        jobs:job_id (
          id,
          homeowner_name,
          address,
          estimated_value,
          final_value
        ),
        supplement_items (
          id,
          supplement_number,
          line_item,
          cost,
          quantity,
          unit,
          reason,
          reason_type
        ),
        evidence_photos (
          id,
          photo_url,
          ai_damage_type,
          ai_findings,
          ai_location,
          photo_category
        )
      `)
      .eq('id', claimId)
      .single();

    if (claimError || !claim) {
      return NextResponse.json(
        { error: 'Claim not found' },
        { status: 404 }
      );
    }

    // Generate HTML for PDF (in production, use a proper PDF library like puppeteer or pdfkit)
    const htmlContent = generateClaimDocumentPackHTML(claim);

    // For now, we'll return the HTML and a note that PDF generation needs implementation
    // In production, you would:
    // 1. Use puppeteer or similar to convert HTML to PDF
    // 2. Upload PDF to Supabase Storage
    // 3. Save URL to claim_document_pack_url
    // 4. Return the PDF URL

    const pdfUrl = `/api/insurance-claims/${claimId}/document-pack/view`;

    // Update claim with document pack URL (placeholder)
    await serviceSupabase
      .from('insurance_claims')
      .update({
        claim_document_pack_url: pdfUrl,
      })
      .eq('id', claimId);

    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
      html_content: htmlContent,
      note: 'PDF generation requires implementation with a PDF library (e.g., puppeteer or pdfkit)',
    });
  } catch (error: any) {
    console.error('Error generating document pack:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

function generateClaimDocumentPackHTML(claim: any): string {
  const job = claim.jobs;
  const supplements = claim.supplement_items || [];
  const photos = claim.evidence_photos || [];

  // Group photos by category
  const photosByCategory: Record<string, typeof photos> = {};
  photos.forEach((photo: any) => {
    const category = photo.photo_category || 'other';
    if (!photosByCategory[category]) {
      photosByCategory[category] = [];
    }
    photosByCategory[category].push(photo);
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Insurance Claim Document Pack - ${claim.claim_number}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #1a1a1a; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
    h2 { color: #333; margin-top: 30px; }
    .section { margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f5f5f5; font-weight: bold; }
    .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }
    .photo-item { border: 1px solid #ddd; padding: 10px; }
    .photo-item img { max-width: 100%; height: auto; }
    .financial-summary { background-color: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .financial-item { display: flex; justify-content: space-between; margin: 10px 0; }
    .label { font-weight: bold; }
    .value { color: #0066cc; }
  </style>
</head>
<body>
  <h1>Insurance Claim Document Pack</h1>
  
  <div class="section">
    <h2>Claim Information</h2>
    <table>
      <tr><th>Claim Number</th><td>${claim.claim_number}</td></tr>
      <tr><th>Insurance Carrier</th><td>${claim.carrier}</td></tr>
      <tr><th>Policy Number</th><td>${claim.policy_number || 'N/A'}</td></tr>
      <tr><th>Claim Status</th><td>${claim.claim_status}</td></tr>
      <tr><th>Claim Filed Date</th><td>${claim.claim_filed_date || 'N/A'}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Property Information</h2>
    <table>
      <tr><th>Homeowner</th><td>${job?.homeowner_name || 'N/A'}</td></tr>
      <tr><th>Address</th><td>${job?.address || 'N/A'}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Adjuster Information</h2>
    <table>
      <tr><th>Adjuster Name</th><td>${claim.adjuster_name || 'N/A'}</td></tr>
      <tr><th>Adjuster Phone</th><td>${claim.adjuster_phone || 'N/A'}</td></tr>
      <tr><th>Adjuster Email</th><td>${claim.adjuster_email || 'N/A'}</td></tr>
      <tr><th>Adjuster Company</th><td>${claim.adjuster_company || 'N/A'}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Financial Summary</h2>
    <div class="financial-summary">
      <div class="financial-item">
        <span class="label">RCV (Replacement Cost Value):</span>
        <span class="value">$${(claim.rcv || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="financial-item">
        <span class="label">Depreciation:</span>
        <span class="value">$${(claim.depreciation || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="financial-item">
        <span class="label">ACV (Actual Cash Value):</span>
        <span class="value">$${(claim.acv || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="financial-item">
        <span class="label">Deductible:</span>
        <span class="value">$${(claim.deductible || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="financial-item">
        <span class="label">Total Claim Value:</span>
        <span class="value">$${(claim.total_claim_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
      <div class="financial-item">
        <span class="label">Total Supplement Value:</span>
        <span class="value">$${(claim.total_supplement_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    </div>
  </div>

  ${supplements.length > 0 ? `
  <div class="section">
    <h2>Supplement Items</h2>
    <table>
      <thead>
        <tr>
          <th>Supplement #</th>
          <th>Line Item</th>
          <th>Quantity</th>
          <th>Unit</th>
          <th>Cost</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        ${supplements.map((item: any) => `
          <tr>
            <td>${item.supplement_number}</td>
            <td>${item.line_item}</td>
            <td>${item.quantity || 1}</td>
            <td>${item.unit || 'EA'}</td>
            <td>$${(item.cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${item.reason || 'N/A'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${photos.length > 0 ? `
  <div class="section">
    <h2>Evidence Photos</h2>
    ${Object.entries(photosByCategory).map(([category, categoryPhotos]: [string, any]) => `
      <h3>${category.charAt(0).toUpperCase() + category.slice(1)} Photos</h3>
      <div class="photo-grid">
        ${categoryPhotos.map((photo: any) => `
          <div class="photo-item">
            <img src="${photo.photo_url}" alt="Evidence photo" />
            <p><strong>Damage Type:</strong> ${photo.ai_damage_type || 'N/A'}</p>
            <p><strong>Location:</strong> ${photo.ai_location || 'N/A'}</p>
            <p><strong>Findings:</strong> ${photo.ai_findings || 'N/A'}</p>
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>
  ` : ''}

  <div class="section">
    <h2>Approved Scope</h2>
    <pre>${JSON.stringify(claim.approved_scope || [], null, 2)}</pre>
  </div>

  ${claim.missing_items && claim.missing_items.length > 0 ? `
  <div class="section">
    <h2>Missing Items from Adjuster Scope</h2>
    <ul>
      ${claim.missing_items.map((item: any) => `
        <li><strong>${item.line_item}</strong>: ${item.reason || 'Missing from scope'}</li>
      `).join('')}
    </ul>
  </div>
  ` : ''}

  <div class="section">
    <p><em>Generated on ${new Date().toLocaleString()}</em></p>
  </div>
</body>
</html>
  `.trim();
}





















