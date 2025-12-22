// Block 190000 — SmartSend Roofing AI Roof Measurements v1
// API Route: Generate PDF Report for Roof Measurement
// GET /api/jobs/[jobId]/measurements/[measurementId]/report

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

function generateRoofReportHTML(
  job: any,
  measurement: any,
  materials: any
): string {
  const date = new Date(measurement.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>SmartSend Roof Measurement Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #fff;
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      margin: 0;
      color: #2563eb;
      font-size: 28px;
    }
    .header p {
      margin: 5px 0;
      color: #666;
      font-size: 14px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #1e40af;
      font-size: 20px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 8px;
      margin-bottom: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin-bottom: 20px;
    }
    .info-item {
      padding: 10px;
      background: #f9fafb;
      border-radius: 6px;
    }
    .info-label {
      font-weight: 600;
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .info-value {
      font-size: 18px;
      color: #111;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    table th {
      background: #2563eb;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
    }
    table td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    table tr:last-child td {
      border-bottom: none;
    }
    .materials-list {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      margin-top: 15px;
    }
    .materials-list ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .materials-list li {
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    .materials-list li:last-child {
      border-bottom: none;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    .confidence-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 10px;
    }
    .confidence-high {
      background: #d1fae5;
      color: #065f46;
    }
    .confidence-medium {
      background: #fef3c7;
      color: #92400e;
    }
    .confidence-low {
      background: #fee2e2;
      color: #991b1b;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>SmartSend Roof Measurement Report</h1>
    <p><strong>Job Address:</strong> ${job.address || "N/A"}</p>
    <p><strong>Generated:</strong> ${date}</p>
    <p><strong>Method:</strong> ${measurement.method.toUpperCase()}</p>
  </div>

  <div class="section">
    <h2>Measurement Summary</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Total Squares</div>
        <div class="info-value">${measurement.squares || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Pitch</div>
        <div class="info-value">${measurement.pitch || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Facets</div>
        <div class="info-value">${measurement.facets || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Waste Factor</div>
        <div class="info-value">${((measurement.waste_factor || 0) * 100).toFixed(0)}%</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Linear Measurements</h2>
    <table>
      <thead>
        <tr>
          <th>Component</th>
          <th>Length (ft)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ridge</td>
          <td>${measurement.ridges_length || 0}</td>
        </tr>
        <tr>
          <td>Eaves</td>
          <td>${measurement.eaves_length || 0}</td>
        </tr>
        <tr>
          <td>Valleys</td>
          <td>${measurement.valleys_length || 0}</td>
        </tr>
        <tr>
          <td>Hips</td>
          <td>${measurement.hips_length || 0}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Materials Needed</h2>
    <div class="materials-list">
      <ul>
        ${materials.bundles ? `<li><strong>Bundles:</strong> ${materials.bundles}</li>` : ""}
        ${materials.starter ? `<li><strong>Starter Bundles:</strong> ${materials.starter}</li>` : ""}
        ${materials.ridge ? `<li><strong>Ridge Bundles:</strong> ${materials.ridge}</li>` : ""}
        ${materials.underlayment_rolls ? `<li><strong>Underlayment Rolls:</strong> ${materials.underlayment_rolls}</li>` : ""}
        ${materials.ice_water_ft ? `<li><strong>Ice & Water Shield:</strong> ${materials.ice_water_ft} ft</li>` : ""}
        ${materials.drip_edge_ft ? `<li><strong>Drip Edge:</strong> ${materials.drip_edge_ft} ft</li>` : ""}
        ${materials.nails_lbs ? `<li><strong>Nails:</strong> ${materials.nails_lbs} lbs</li>` : ""}
        ${materials.ventilation ? `<li><strong>Ventilation:</strong> ${materials.ventilation} units</li>` : ""}
      </ul>
    </div>
  </div>

  <div class="footer">
    <p>Generated by SmartSend AI</p>
    <p>Confidence: ${((measurement.confidence || 0) * 100).toFixed(0)}%</p>
  </div>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ jobId: string; measurementId: string }>;
  }
) {
  try {
    const { jobId, measurementId } = await params;
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

    // Get measurement
    const { data: measurement, error: measurementError } =
      await serviceSupabase
        .from("roof_measurements")
        .select("*")
        .eq("id", measurementId)
        .eq("job_id", jobId)
        .single();

    if (measurementError || !measurement) {
      return NextResponse.json(
        { error: "Measurement not found" },
        { status: 404 }
      );
    }

    // Get job
    const { data: job, error: jobError } = await serviceSupabase
      .from("jobs")
      .select("id, address")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get materials (from measurement.materials JSONB)
    const materials = measurement.materials || {};

    // Generate HTML report
    const htmlContent = generateRoofReportHTML(job, measurement, materials);

    // Return HTML (can be converted to PDF using browser print or a service like Puppeteer)
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="roof-measurement-report-${measurementId}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating report:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























