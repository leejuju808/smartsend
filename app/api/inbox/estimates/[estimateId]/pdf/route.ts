import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/estimates/[estimateId]/pdf
 * Generate PDF estimate document
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { estimateId: string } }
) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { estimateId } = params;

    // Get estimate with all related data (including Block 20020 data)
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select(`
        *,
        estimate_line_items (*),
        estimate_material_quantities (*),
        estimate_upsells (*),
        estimate_material_brands (*),
        inbox_threads:thread_id (
          id,
          contacts:contact_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            address_line1,
            address_line2,
            city,
            state,
            zip_code
          ),
          campaigns:campaign_id (
            id,
            name,
            from_name,
            from_email
          )
        )
      `)
      .eq("id", estimateId)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    const thread = estimate.inbox_threads;
    const contact = thread?.contacts;
    const campaign = thread?.campaigns;

    // Generate HTML for PDF
    const htmlContent = generateEstimateHTML(estimate, contact, campaign);

    // For now, we'll return the HTML content
    // In production, use a PDF generation service like:
    // - Puppeteer (HTML to PDF)
    // - @react-pdf/renderer
    // - pdfkit
    // - A service like PDFShift, HTMLPDF, etc.

    // Store PDF URL (placeholder for now)
    const pdfUrl = `/api/inbox/estimates/${estimateId}/pdf/view`;

    // Update estimate with PDF info
    await supabase
      .from("estimates")
      .update({
        pdf_url: pdfUrl,
        pdf_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimateId);

    return NextResponse.json({
      success: true,
      pdf_url: pdfUrl,
      html_content: htmlContent, // Return HTML for now, client can convert to PDF
    });
  } catch (error) {
    console.error("Error in /api/inbox/estimates/[estimateId]/pdf:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/estimates/[estimateId]/pdf
 * View PDF estimate (returns HTML for now)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { estimateId: string } }
) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { estimateId } = params;

    // Get estimate with all related data (including Block 20020 data)
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .select(`
        *,
        estimate_line_items (*),
        estimate_material_quantities (*),
        estimate_upsells (*),
        estimate_material_brands (*),
        inbox_threads:thread_id (
          id,
          contacts:contact_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            address_line1,
            address_line2,
            city,
            state,
            zip_code
          ),
          campaigns:campaign_id (
            id,
            name,
            from_name,
            from_email
          )
        )
      `)
      .eq("id", estimateId)
      .single();

    if (estimateError || !estimate) {
      return NextResponse.json(
        { error: "Estimate not found" },
        { status: 404 }
      );
    }

    const thread = estimate.inbox_threads;
    const contact = thread?.contacts;
    const campaign = thread?.campaigns;

    // Generate HTML
    const htmlContent = generateEstimateHTML(estimate, contact, campaign);

    // Return HTML (can be converted to PDF on client side)
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error) {
    console.error("Error in GET /api/inbox/estimates/[estimateId]/pdf:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function generateEstimateHTML(estimate: any, contact: any, campaign: any): string {
  const date = new Date(estimate.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const priceRange = estimate.price_range_text || 
    `$${estimate.estimated_total_min?.toFixed(2)} - $${estimate.estimated_total_max?.toFixed(2)}`;

  const lineItems = estimate.estimate_line_items || [];
  const materialQuantities = estimate.estimate_material_quantities || [];
  const upsells = estimate.estimate_upsells || [];
  const brands = estimate.estimate_material_brands || [];
  const codeItems = estimate.insurance_code_items || [];
  
  const subtotal = lineItems.reduce((sum: number, item: any) => sum + (item.total_cost || 0), 0);

  // Block 20020: Material quantities summary
  const materialQuantitiesHTML = materialQuantities.length > 0 ? `
    <div class="section">
      <h2>Material Quantities</h2>
      <table>
        <thead>
          <tr>
            <th>Material</th>
            <th class="text-right">Quantity</th>
            <th class="text-right">Unit</th>
            ${estimate.waste_factor_percent ? '<th class="text-right">Waste Factor</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${materialQuantities.map((mq: any) => `
            <tr>
              <td>${mq.material_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</td>
              <td class="text-right">${mq.quantity_avg?.toFixed(1) || mq.quantity_min + '-' + mq.quantity_max}</td>
              <td class="text-right">${mq.unit}</td>
              ${estimate.waste_factor_percent ? `<td class="text-right">${mq.waste_factor_percent || estimate.waste_factor_percent}%</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${estimate.waste_factor_percent ? `<p class="info-note">Waste Factor: ${estimate.waste_factor_percent}% (${estimate.waste_factor_category || 'standard'})</p>` : ''}
    </div>
  ` : '';

  // Block 20020: Labor hours
  const laborHoursHTML = estimate.estimated_labor_hours_min ? `
    <div class="section">
      <h2>Labor Estimate</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Crew Size:</span>
          <span class="info-value">${estimate.estimated_crew_size || 4} person</span>
        </div>
        <div class="info-item">
          <span class="info-label">Labor Hours:</span>
          <span class="info-value">${estimate.estimated_labor_hours_min}-${estimate.estimated_labor_hours_max} hrs</span>
        </div>
        <div class="info-item">
          <span class="info-label">Job Duration:</span>
          <span class="info-value">${estimate.estimated_job_duration_days_min}-${estimate.estimated_job_duration_days_max} days</span>
        </div>
      </div>
    </div>
  ` : '';

  // Block 20020: Permit requirements
  const permitHTML = estimate.permit_required ? `
    <div class="section permit-section">
      <h2>Permit Requirements</h2>
      <div class="permit-notice">
        <strong>⚠️ Permit Required:</strong> ${estimate.permit_reason || 'Building permit required for this work'}
        ${estimate.permit_cost_estimate ? `<br><span class="permit-cost">Estimated Permit Cost: $${estimate.permit_cost_estimate.toFixed(2)}</span>` : ''}
      </div>
    </div>
  ` : '';

  // Block 20020: Insurance code items
  const codeItemsHTML = codeItems.length > 0 ? `
    <div class="section code-items-section">
      <h2>Code-Required Items</h2>
      <p class="code-note">The following items are required by local building code:</p>
      <ul class="code-items-list">
        ${codeItems.map((item: any) => `
          <li>
            <strong>${item.description || item.item_type}</strong>
            ${item.code_reference ? `<br><small>Code Reference: ${item.code_reference}</small>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // Block 20020: Material brand recommendations
  const brandsHTML = brands.length > 0 ? `
    <div class="section brands-section">
      <h2>Recommended Material Brands</h2>
      ${brands.map((brand: any) => `
        <div class="brand-card">
          <h3>${brand.brand_name}${brand.is_recommended ? ' <span class="recommended-badge">Recommended</span>' : ''}</h3>
          ${brand.product_line ? `<p class="product-line">${brand.product_line}</p>` : ''}
          ${brand.warranty_years ? `<p><strong>Warranty:</strong> ${brand.warranty_years} years</p>` : ''}
          <p><strong>Price Range:</strong> $${brand.price_per_square_min}-$${brand.price_per_square_max} per square</p>
          ${brand.pros && brand.pros.length > 0 ? `
            <p><strong>Pros:</strong> ${brand.pros.join(', ')}</p>
          ` : ''}
          ${brand.best_for ? `<p><strong>Best For:</strong> ${brand.best_for}</p>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  // Block 20020: Upsell options
  const upsellsHTML = upsells.length > 0 ? `
    <div class="section upsells-section">
      <h2>Optional Upgrades</h2>
      <p class="upsell-note">Consider these optional upgrades to enhance your roof:</p>
      ${upsells.map((upsell: any) => `
        <div class="upsell-card ${upsell.is_recommended ? 'recommended' : ''}">
          <h3>${upsell.title}${upsell.is_recommended ? ' <span class="recommended-badge">Recommended</span>' : ''}</h3>
          <p>${upsell.description || ''}</p>
          <p class="upsell-price"><strong>Cost:</strong> $${upsell.cost_min.toFixed(0)}-$${upsell.cost_max.toFixed(0)}</p>
          ${upsell.ai_reasoning ? `<p class="upsell-reasoning"><em>${upsell.ai_reasoning}</em></p>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  // Block 20020: Customer summary
  const customerSummaryHTML = estimate.customer_summary ? `
    <div class="section summary-section">
      <h2>Estimate Summary</h2>
      <div class="summary-box">
        <p>${estimate.customer_summary}</p>
      </div>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Estimate - ${estimate.id}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #2563eb;
      margin-bottom: 5px;
    }
    .estimate-title {
      font-size: 32px;
      font-weight: bold;
      margin: 20px 0;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .info-column {
      flex: 1;
    }
    .info-label {
      font-weight: bold;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 16px;
      margin-bottom: 15px;
    }
    .price-range {
      font-size: 36px;
      font-weight: bold;
      color: #2563eb;
      text-align: center;
      padding: 20px;
      background: #eff6ff;
      border-radius: 8px;
      margin: 30px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 30px 0;
    }
    th {
      background: #f3f4f6;
      padding: 12px;
      text-align: left;
      font-weight: bold;
      border-bottom: 2px solid #e5e7eb;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .text-right {
      text-align: right;
    }
    .total-row {
      font-weight: bold;
      font-size: 18px;
      background: #f9fafb;
    }
    .notes {
      margin-top: 30px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    .ai-reasoning {
      margin: 20px 0;
      padding: 15px;
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      border-radius: 4px;
      font-style: italic;
    }
    .section {
      margin: 30px 0;
      padding: 20px 0;
      border-top: 1px solid #e5e7eb;
    }
    .section h2 {
      font-size: 20px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #2563eb;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin: 15px 0;
    }
    .info-item {
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
    }
    .info-item .info-label {
      display: block;
      font-size: 12px;
      color: #666;
      margin-bottom: 5px;
    }
    .info-item .info-value {
      font-size: 18px;
      font-weight: bold;
      color: #333;
    }
    .permit-section {
      background: #fef2f2;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #ef4444;
    }
    .permit-notice {
      color: #991b1b;
      font-weight: 500;
    }
    .permit-cost {
      color: #dc2626;
      font-weight: bold;
    }
    .code-items-section {
      background: #f0f9ff;
      padding: 20px;
      border-radius: 8px;
    }
    .code-note {
      color: #0369a1;
      margin-bottom: 10px;
    }
    .code-items-list {
      list-style: none;
      padding: 0;
    }
    .code-items-list li {
      padding: 10px;
      margin: 8px 0;
      background: white;
      border-left: 3px solid #0ea5e9;
      border-radius: 4px;
    }
    .brands-section .brand-card {
      margin: 15px 0;
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .brands-section .brand-card h3 {
      margin-top: 0;
      color: #2563eb;
    }
    .recommended-badge {
      background: #10b981;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: normal;
    }
    .upsells-section .upsell-card {
      margin: 15px 0;
      padding: 15px;
      background: #f9fafb;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .upsells-section .upsell-card.recommended {
      border: 2px solid #10b981;
      background: #f0fdf4;
    }
    .upsell-price {
      color: #2563eb;
      font-size: 16px;
      margin: 10px 0;
    }
    .upsell-reasoning {
      color: #666;
      font-size: 14px;
      margin-top: 8px;
    }
    .summary-section .summary-box {
      background: #eff6ff;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #2563eb;
    }
    .summary-box p {
      margin: 0;
      line-height: 1.8;
      color: #1e40af;
    }
    .info-note {
      margin-top: 10px;
      font-size: 14px;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${campaign?.from_name || "SmartSend Roofing"}</div>
    <div class="estimate-title">ESTIMATE</div>
  </div>

  <div class="info-section">
    <div class="info-column">
      <div class="info-label">To:</div>
      <div class="info-value">
        ${contact?.first_name || ""} ${contact?.last_name || ""}<br>
        ${contact?.address_line1 || ""}<br>
        ${contact?.address_line2 ? contact.address_line2 + "<br>" : ""}
        ${contact?.city || ""}, ${contact?.state || ""} ${contact?.zip_code || ""}
      </div>
    </div>
    <div class="info-column">
      <div class="info-label">Estimate Details:</div>
      <div class="info-value">
        Estimate #: ${estimate.id.substring(0, 8)}<br>
        Date: ${date}<br>
        Job Type: ${estimate.job_type?.replace("_", " ") || "Roofing"}<br>
        Status: ${estimate.status}
      </div>
    </div>
  </div>

  ${estimate.ai_reasoning ? `
    <div class="ai-reasoning">
      <strong>AI Analysis:</strong> ${estimate.ai_reasoning}
    </div>
  ` : ""}

  <div class="price-range">
    Estimated Total: ${priceRange}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Quantity</th>
        <th class="text-right">Unit Cost</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineItems.map((item: any) => `
        <tr>
          <td>
            ${item.description}
            ${item.notes ? `<br><small style="color: #666;">${item.notes}</small>` : ""}
          </td>
          <td class="text-right">${item.quantity} ${item.unit}</td>
          <td class="text-right">$${item.unit_cost.toFixed(2)}</td>
          <td class="text-right">$${item.total_cost.toFixed(2)}</td>
        </tr>
      `).join("")}
      <tr class="total-row">
        <td colspan="3" class="text-right">Estimated Total:</td>
        <td class="text-right">${priceRange}</td>
      </tr>
    </tbody>
  </table>

  ${customerSummaryHTML}

  ${materialQuantitiesHTML}

  ${laborHoursHTML}

  ${permitHTML}

  ${codeItemsHTML}

  ${brandsHTML}

  ${upsellsHTML}

  <div class="notes">
    <h3>Notes:</h3>
    <p>This is a preliminary estimate based on the information and photos provided. A formal inspection will provide a detailed, written estimate with exact pricing.</p>
    <p>This estimate is valid for 30 days from the date above.</p>
    <p>Final pricing may vary based on actual conditions discovered during inspection.</p>
    ${estimate.permit_required ? `<p><strong>Note:</strong> Building permit is required for this work. Permit cost is not included in the estimate total.</p>` : ''}
  </div>

  <div class="footer">
    <p>Generated by SmartSend AI Estimate Builder v2</p>
    <p>This is not a legal contract. A formal written estimate will be provided after inspection.</p>
  </div>
</body>
</html>
  `.trim();
}

