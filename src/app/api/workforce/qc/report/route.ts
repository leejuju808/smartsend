// GET /api/workforce/qc/report - Generate QC Report PDF
// Query params: job_id, inspection_id

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("job_id");
    const inspectionId = searchParams.get("inspection_id");

    if (!jobId && !inspectionId) {
      return NextResponse.json(
        { error: "Missing required parameter: job_id or inspection_id" },
        { status: 400 }
      );
    }

    // Get inspection
    let inspection;
    if (inspectionId) {
      const { data: inspectionData, error: inspectionError } = await supabase
        .from("qc_inspections")
        .select(`
          *,
          foreman:foreman_id (
            id,
            first_name,
            last_name,
            role
          )
        `)
        .eq("id", inspectionId)
        .single();

      if (inspectionError || !inspectionData) {
        return NextResponse.json(
          { error: "Inspection not found" },
          { status: 404 }
        );
      }
      inspection = inspectionData;
    } else {
      // Get latest inspection for job
      const { data: inspections, error: inspectionsError } = await supabase
        .from("qc_inspections")
        .select(`
          *,
          foreman:foreman_id (
            id,
            first_name,
            last_name,
            role
          )
        `)
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false })
        .limit(1);

      if (inspectionsError || !inspections || inspections.length === 0) {
        return NextResponse.json(
          { error: "No inspection found for this job" },
          { status: 404 }
        );
      }
      inspection = inspections[0];
    }

    // Get inspection items
    const { data: items, error: itemsError } = await supabase
      .from("qc_inspection_items")
      .select("*")
      .eq("inspection_id", inspection.id)
      .order("category", { ascending: true })
      .order("created_at", { ascending: true });

    if (itemsError) {
      console.error("Error fetching inspection items:", itemsError);
    }

    // Get punch list items
    const { data: punchList, error: punchListError } = await supabase
      .from("qc_punch_list")
      .select(`
        *,
        assigned_employee:assigned_to (
          id,
          first_name,
          last_name
        )
      `)
      .eq("inspection_id", inspection.id)
      .order("created_at", { ascending: false });

    if (punchListError) {
      console.error("Error fetching punch list:", punchListError);
    }

    // Get customer signoff
    const { data: signoff } = await supabase
      .from("customer_signoff")
      .select("*")
      .eq("inspection_id", inspection.id)
      .single();

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address
        )
      `)
      .eq("id", inspection.job_id)
      .single();

    if (jobError) {
      console.error("Error fetching job:", jobError);
    }

    // Get company details
    const { data: company } = await supabase
      .from("roofing_companies")
      .select("*")
      .eq("id", job?.company_id || "")
      .single();

    // Calculate stats
    const passedCount = (items || []).filter((i) => i.passed === true).length;
    const failedCount = (items || []).filter((i) => i.passed === false).length;
    const totalCount = (items || []).length;
    const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

    // Group items by category
    const groupedItems = (items || []).reduce((acc, item) => {
      const category = item.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {} as Record<string, typeof items>);

    // Generate HTML for PDF
    const htmlContent = generateQCReportHTML({
      job,
      company,
      inspection,
      items: groupedItems,
      punchList: punchList || [],
      signoff,
      stats: {
        passedCount,
        failedCount,
        totalCount,
        passRate,
      },
    });

    // Return HTML (can be converted to PDF using browser print or a service like Puppeteer)
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="qc-report-${inspection.job_id}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating QC report:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateQCReportHTML(data: any): string {
  const {
    job,
    company,
    inspection,
    items,
    punchList,
    signoff,
    stats,
  } = data;

  const foremanName = inspection.foreman
    ? `${inspection.foreman.first_name} ${inspection.foreman.last_name}`
    : "Not assigned";

  const homeownerName = job?.leads
    ? `${job.leads.first_name} ${job.leads.last_name}`
    : job?.homeowner_name || "N/A";

  const address = job?.leads?.address || job?.address || "N/A";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QC Inspection Report</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      background: #fff;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 28px;
      color: #1e40af;
      margin-bottom: 10px;
    }
    .header-info {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 20px;
      margin-top: 15px;
    }
    .info-block {
      flex: 1;
      min-width: 200px;
    }
    .info-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 16px;
      font-weight: 600;
      color: #111;
    }
    .summary {
      background: #f8fafc;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .summary h2 {
      font-size: 20px;
      margin-bottom: 15px;
      color: #1e40af;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }
    .stat-box {
      text-align: center;
      padding: 15px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .stat-value.passed { color: #10b981; }
    .stat-value.failed { color: #ef4444; }
    .stat-value.total { color: #3b82f6; }
    .stat-value.rate { color: #8b5cf6; }
    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      font-size: 20px;
      color: #1e40af;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    .category {
      margin-bottom: 25px;
    }
    .category h3 {
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 10px;
      padding: 8px 12px;
      background: #f3f4f6;
      border-left: 4px solid #2563eb;
    }
    .item {
      padding: 12px;
      margin-bottom: 8px;
      border-left: 3px solid #e5e7eb;
      background: #fafafa;
    }
    .item.passed {
      border-left-color: #10b981;
      background: #f0fdf4;
    }
    .item.failed {
      border-left-color: #ef4444;
      background: #fef2f2;
    }
    .item-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 5px;
    }
    .item-status {
      font-size: 18px;
      font-weight: bold;
    }
    .item-status.passed { color: #10b981; }
    .item-status.failed { color: #ef4444; }
    .item-text {
      font-size: 14px;
      color: #374151;
    }
    .item-notes {
      font-size: 12px;
      color: #6b7280;
      margin-top: 5px;
      font-style: italic;
    }
    .item-photo {
      margin-top: 8px;
    }
    .item-photo img {
      max-width: 200px;
      max-height: 150px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    .punch-list {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 15px;
    }
    .punch-item {
      padding: 10px;
      margin-bottom: 8px;
      background: white;
      border-left: 3px solid #ef4444;
      border-radius: 4px;
    }
    .punch-item.completed {
      border-left-color: #10b981;
      opacity: 0.7;
    }
    .signature-section {
      border-top: 2px solid #e5e7eb;
      padding-top: 20px;
      margin-top: 30px;
    }
    .signature-box {
      display: inline-block;
      padding: 15px;
      border: 2px solid #e5e7eb;
      border-radius: 6px;
      background: white;
    }
    .signature-box img {
      max-width: 300px;
      max-height: 100px;
      display: block;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #6b7280;
    }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Quality Control Inspection Report</h1>
    <div class="header-info">
      <div class="info-block">
        <div class="info-label">Job ID</div>
        <div class="info-value">${inspection.job_id.substring(0, 8)}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Inspection Date</div>
        <div class="info-value">${new Date(inspection.completed_at || inspection.started_at).toLocaleDateString()}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Foreman</div>
        <div class="info-value">${foremanName}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Status</div>
        <div class="info-value">${inspection.status.replace('_', ' ').toUpperCase()}</div>
      </div>
    </div>
    <div class="header-info" style="margin-top: 15px;">
      <div class="info-block">
        <div class="info-label">Homeowner</div>
        <div class="info-value">${homeownerName}</div>
      </div>
      <div class="info-block">
        <div class="info-label">Address</div>
        <div class="info-value">${address}</div>
      </div>
    </div>
    ${company ? `
    <div class="header-info" style="margin-top: 15px;">
      <div class="info-block">
        <div class="info-label">Company</div>
        <div class="info-value">${company.name || 'N/A'}</div>
      </div>
    </div>
    ` : ''}
  </div>

  <div class="summary">
    <h2>Inspection Summary</h2>
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-value passed">${stats.passedCount}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-box">
        <div class="stat-value failed">${stats.failedCount}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-box">
        <div class="stat-value total">${stats.totalCount}</div>
        <div class="stat-label">Total Items</div>
      </div>
      <div class="stat-box">
        <div class="stat-value rate">${stats.passRate}%</div>
        <div class="stat-label">Pass Rate</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Inspection Checklist</h2>
    ${Object.entries(items).map(([category, categoryItems]: [string, any]) => `
      <div class="category">
        <h3>${category}</h3>
        ${categoryItems.map((item: any) => `
          <div class="item ${item.passed === true ? 'passed' : item.passed === false ? 'failed' : ''}">
            <div class="item-header">
              <span class="item-status ${item.passed === true ? 'passed' : item.passed === false ? 'failed' : ''}">
                ${item.passed === true ? '✓' : item.passed === false ? '✗' : '○'}
              </span>
              <span class="item-text">${item.item || 'N/A'}</span>
            </div>
            ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
            ${item.photo_url ? `
              <div class="item-photo">
                <img src="${item.photo_url}" alt="QC Photo" />
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `).join('')}
  </div>

  ${punchList.length > 0 ? `
    <div class="section">
      <h2>Punch List Items</h2>
      <div class="punch-list">
        ${punchList.map((item: any) => `
          <div class="punch-item ${item.status === 'completed' ? 'completed' : ''}">
            <strong>${item.description}</strong>
            ${item.assigned_employee ? `
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                Assigned to: ${item.assigned_employee.first_name} ${item.assigned_employee.last_name}
              </div>
            ` : ''}
            <div style="font-size: 12px; color: #666; margin-top: 4px;">
              Status: ${item.status.toUpperCase()}
              ${item.completed_at ? ` • Completed: ${new Date(item.completed_at).toLocaleDateString()}` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : ''}

  ${signoff ? `
    <div class="signature-section">
      <h2>Customer Sign-Off</h2>
      <div>
        <p><strong>Signed by:</strong> ${signoff.customer_name}</p>
        <p><strong>Date:</strong> ${new Date(signoff.signed_at).toLocaleDateString()}</p>
        <div class="signature-box" style="margin-top: 15px;">
          <img src="${signoff.signature_url}" alt="Customer Signature" />
        </div>
      </div>
    </div>
  ` : ''}

  <div class="footer">
    <p>Generated on ${new Date().toLocaleString()}</p>
    <p>This report was generated by SmartSend QC Engine</p>
  </div>
</body>
</html>
  `;
}
























