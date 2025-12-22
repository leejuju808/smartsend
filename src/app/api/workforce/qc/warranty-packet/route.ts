// GET /api/workforce/qc/warranty-packet - Generate warranty packet
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

    // Get inspection (same logic as report)
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

    // Get all data needed for warranty packet
    const { data: items } = await supabase
      .from("qc_inspection_items")
      .select("*")
      .eq("inspection_id", inspection.id);

    const { data: signoff } = await supabase
      .from("customer_signoff")
      .select("*")
      .eq("inspection_id", inspection.id)
      .single();

    const { data: job } = await supabase
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

    const { data: company } = await supabase
      .from("roofing_companies")
      .select("*")
      .eq("id", job?.company_id || "")
      .single();

    // Get job photos (before/after)
    const { data: photos } = await supabase
      .from("roofing_field_photos")
      .select("*")
      .eq("job_id", inspection.job_id)
      .order("created_at", { ascending: true });

    // Generate warranty packet HTML
    const htmlContent = generateWarrantyPacketHTML({
      job,
      company,
      inspection,
      items: items || [],
      signoff,
      photos: photos || [],
    });

    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="warranty-packet-${inspection.job_id}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating warranty packet:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateWarrantyPacketHTML(data: any): string {
  const { job, company, inspection, items, signoff, photos } = data;

  const passedCount = items.filter((i: any) => i.passed === true).length;
  const totalCount = items.length;
  const allPassed = passedCount === totalCount && totalCount > 0;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warranty Packet</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      background: #fff;
    }
    .header {
      text-align: center;
      border-bottom: 4px solid #2563eb;
      padding-bottom: 30px;
      margin-bottom: 40px;
    }
    .header h1 {
      font-size: 36px;
      color: #1e40af;
      margin-bottom: 10px;
    }
    .warranty-badge {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 8px 20px;
      border-radius: 20px;
      font-weight: 600;
      margin-top: 15px;
    }
    .section {
      margin-bottom: 40px;
    }
    .section h2 {
      font-size: 24px;
      color: #1e40af;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 20px;
    }
    .info-item {
      padding: 15px;
      background: #f8fafc;
      border-radius: 6px;
    }
    .info-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 16px;
      font-weight: 600;
    }
    .verification-box {
      background: #f0fdf4;
      border: 2px solid #10b981;
      border-radius: 8px;
      padding: 25px;
      margin: 30px 0;
      text-align: center;
    }
    .verification-box h3 {
      font-size: 20px;
      color: #059669;
      margin-bottom: 15px;
    }
    .checklist-summary {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .photo-item {
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
    }
    .photo-item img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }
    .signature-section {
      border-top: 2px solid #e5e7eb;
      padding-top: 30px;
      margin-top: 40px;
    }
    .signature-box {
      display: inline-block;
      padding: 20px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      margin-top: 15px;
    }
    .signature-box img {
      max-width: 400px;
      max-height: 150px;
      display: block;
    }
    .footer {
      margin-top: 50px;
      padding-top: 30px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 14px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Warranty Packet</h1>
    <p style="font-size: 18px; color: #666; margin-top: 10px;">
      ${company?.name || 'SmartSend Roofing'}
    </p>
    ${allPassed ? `
      <div class="warranty-badge">
        ✓ WARRANTY VERIFIED BY SMARTSEND
      </div>
      <p style="margin-top: 15px; color: #059669; font-weight: 600;">
        All installation steps have passed QC inspection
      </p>
    ` : ''}
  </div>

  <div class="section">
    <h2>Installation Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Job ID</div>
        <div class="info-value">${inspection.job_id.substring(0, 8)}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Installation Date</div>
        <div class="info-value">${new Date(inspection.completed_at || inspection.started_at).toLocaleDateString()}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Homeowner</div>
        <div class="info-value">${job?.leads ? `${job.leads.first_name} ${job.leads.last_name}` : job?.homeowner_name || 'N/A'}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Address</div>
        <div class="info-value">${job?.leads?.address || job?.address || 'N/A'}</div>
      </div>
    </div>
  </div>

  ${allPassed ? `
    <div class="verification-box">
      <h3>✓ Quality Control Verification</h3>
      <p style="font-size: 16px; color: #374151;">
        This installation has been inspected and verified by SmartSend's QC Engine.
        All ${totalCount} quality control checks have passed.
      </p>
    </div>
  ` : ''}

  <div class="section">
    <h2>QC Inspection Summary</h2>
    <div class="checklist-summary">
      <p><strong>Total Items Checked:</strong> ${totalCount}</p>
      <p><strong>Items Passed:</strong> ${passedCount}</p>
      <p><strong>Pass Rate:</strong> ${totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0}%</p>
    </div>
  </div>

  ${photos.length > 0 ? `
    <div class="section">
      <h2>Installation Photos</h2>
      <div class="photo-grid">
        ${photos.map((photo: any) => `
          <div class="photo-item">
            <img src="${photo.storage_path || photo.url || ''}" alt="Installation photo" />
          </div>
        `).join('')}
      </div>
    </div>
  ` : ''}

  ${signoff ? `
    <div class="signature-section">
      <h2>Customer Acknowledgment</h2>
      <p><strong>Signed by:</strong> ${signoff.customer_name}</p>
      <p><strong>Date:</strong> ${new Date(signoff.signed_at).toLocaleDateString()}</p>
      <div class="signature-box">
        <img src="${signoff.signature_url}" alt="Customer Signature" />
      </div>
    </div>
  ` : ''}

  <div class="footer">
    <p><strong>This warranty packet serves as proof of quality installation.</strong></p>
    <p style="margin-top: 10px;">Generated by SmartSend QC Engine on ${new Date().toLocaleString()}</p>
    <p style="margin-top: 5px; font-size: 12px;">
      For warranty claims or questions, contact ${company?.name || 'your roofing company'}
    </p>
  </div>
</body>
</html>
  `;
}
























