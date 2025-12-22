// Block 247000 — SmartSend Roofing Field Vision v1
// API Route: Generate PDF Report
// POST /api/fieldvision/report/pdf

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { scanId } = body;

    if (!scanId) {
      return NextResponse.json(
        { error: "scanId is required" },
        { status: 400 }
      );
    }

    // Get scan data
    const { data: scan, error: scanError } = await serviceSupabase
      .from("roof_scans")
      .select("*")
      .eq("id", scanId)
      .single();

    if (scanError || !scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Get job info
    const { data: job } = await serviceSupabase
      .from("jobs")
      .select("id, address, homeowner_name")
      .eq("id", scan.job_id)
      .single();

    // Get damage report
    const { data: damageReport } = await serviceSupabase
      .from("damage_reports")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get images
    const { data: images } = await serviceSupabase
      .from("roof_images")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });

    // Get scope items
    const { data: scopeItems } = await serviceSupabase
      .from("field_vision_scope_items")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });

    // Generate PDF HTML (client can convert to PDF using libraries like jsPDF or puppeteer)
    const pdfHtml = generatePDFHTML({
      scan,
      job,
      damageReport,
      images: images || [],
      scopeItems: scopeItems || [],
    });

    return NextResponse.json({
      success: true,
      html: pdfHtml,
      message: "PDF report generated successfully",
    });
  } catch (error: any) {
    console.error("Error in fieldvision PDF:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generatePDFHTML(data: any): string {
  const { scan, job, damageReport, images, scopeItems } = data;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Field Vision Report - ${job?.address || "Roof Scan"}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      color: #333;
    }
    .header {
      border-bottom: 3px solid #0066cc;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #0066cc;
      margin: 0;
    }
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .section h2 {
      color: #0066cc;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    table th, table td {
      border: 1px solid #ddd;
      padding: 12px;
      text-align: left;
    }
    table th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    .measurement-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 15px;
    }
    .measurement-card {
      border: 1px solid #ddd;
      padding: 15px;
      border-radius: 5px;
    }
    .measurement-card h3 {
      margin-top: 0;
      color: #0066cc;
    }
    .damage-severity {
      display: inline-block;
      padding: 5px 15px;
      border-radius: 20px;
      font-weight: bold;
      margin-top: 10px;
    }
    .severity-low { background-color: #ffeb3b; color: #000; }
    .severity-moderate { background-color: #ff9800; color: #fff; }
    .severity-high { background-color: #f44336; color: #fff; }
    .scope-item {
      padding: 10px;
      border-left: 4px solid #0066cc;
      margin-bottom: 10px;
      background-color: #f9f9f9;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>SmartSend Field Vision Report</h1>
    <p><strong>Job:</strong> ${job?.address || "N/A"}</p>
    <p><strong>Date:</strong> ${new Date(scan.created_at).toLocaleDateString()}</p>
  </div>

  <div class="section">
    <h2>Roof Measurements</h2>
    <div class="measurement-grid">
      <div class="measurement-card">
        <h3>Total Area</h3>
        <p style="font-size: 24px; font-weight: bold;">${scan.total_area || "N/A"} sq ft</p>
        <p>${scan.total_squares || "N/A"} squares</p>
      </div>
      <div class="measurement-card">
        <h3>Pitch</h3>
        <p style="font-size: 24px; font-weight: bold;">${scan.pitch || "N/A"}</p>
        ${scan.pitch_degrees ? `<p>${scan.pitch_degrees.toFixed(1)}°</p>` : ""}
      </div>
      <div class="measurement-card">
        <h3>Perimeter</h3>
        <p style="font-size: 24px; font-weight: bold;">${scan.perimeter || "N/A"} linear feet</p>
      </div>
      <div class="measurement-card">
        <h3>Waste Factor</h3>
        <p style="font-size: 24px; font-weight: bold;">${scan.waste_factor || 12.0}%</p>
      </div>
    </div>
    ${scan.edges && Object.keys(scan.edges).length > 0 ? `
    <h3 style="margin-top: 30px;">Edge Measurements</h3>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Length (LF)</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(scan.edges).map(([key, value]: [string, any]) => `
          <tr>
            <td>${key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</td>
            <td>${value}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    ` : ""}
  </div>

  ${damageReport ? `
  <div class="section">
    <h2>Damage Assessment</h2>
    <p><strong>Severity Score:</strong> ${damageReport.damage_severity_score || 0}/100</p>
    <span class="damage-severity ${
      (damageReport.damage_severity_score || 0) < 30 ? "severity-low" :
      (damageReport.damage_severity_score || 0) < 70 ? "severity-moderate" :
      "severity-high"
    }">
      ${(damageReport.damage_severity_score || 0) < 30 ? "Low" :
        (damageReport.damage_severity_score || 0) < 70 ? "Moderate" :
        "High"} Severity
    </span>
    
    <table style="margin-top: 20px;">
      <thead>
        <tr>
          <th>Damage Type</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Hail Hits</td><td>${damageReport.hail_hits || 0}</td></tr>
        <tr><td>Wind Damage</td><td>${damageReport.wind_damage || 0}</td></tr>
        <tr><td>Missing Shingles</td><td>${damageReport.missing_shingles || 0}</td></tr>
        <tr><td>Nail Pops</td><td>${damageReport.nail_pops || 0}</td></tr>
        <tr><td>Pipe Boot Cracks</td><td>${damageReport.pipe_boot_cracks || 0}</td></tr>
        <tr><td>Flashing Deterioration</td><td>${damageReport.flashing_deterioration || 0}</td></tr>
        <tr><td>Granule Loss</td><td>${damageReport.granule_loss_severity || "None"}</td></tr>
      </tbody>
    </table>
    
    ${damageReport.repair_required ? "<p><strong>Repair Required:</strong> Yes</p>" : ""}
    ${damageReport.replacement_recommended ? "<p><strong>Replacement Recommended:</strong> Yes</p>" : ""}
    ${damageReport.insurance_claim_supporting ? "<p><strong>Insurance Claim Supporting:</strong> Yes</p>" : ""}
  </div>
  ` : ""}

  ${scopeItems && scopeItems.length > 0 ? `
  <div class="section">
    <h2>Recommended Scope Items</h2>
    ${scopeItems.map((item: any) => `
      <div class="scope-item">
        <strong>${item.item_name}</strong><br>
        Quantity: ${item.quantity} ${item.unit}
        ${item.total_price ? `<br>Price: $${item.total_price.toFixed(2)}` : ""}
      </div>
    `).join("")}
  </div>
  ` : ""}

  ${images && images.length > 0 ? `
  <div class="section">
    <h2>Roof Images</h2>
    <p>${images.length} image(s) captured</p>
    ${images.map((img: any, idx: number) => `
      <div style="margin-bottom: 20px;">
        <p><strong>Image ${idx + 1}</strong> - ${img.image_type || "Photo"}</p>
        ${img.damage_detected ? "<p style='color: #f44336;'><strong>Damage Detected</strong></p>" : ""}
        ${img.ai_tags && img.ai_tags.length > 0 ? `
          <p><strong>Features:</strong> ${img.ai_tags.join(", ")}</p>
        ` : ""}
      </div>
    `).join("")}
  </div>
  ` : ""}

  <div class="footer">
    <p>Generated by SmartSend Field Vision v1</p>
    <p>Report ID: ${scan.id}</p>
  </div>
</body>
</html>
  `;
}

























