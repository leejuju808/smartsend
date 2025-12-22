// GET /api/materials/dispute-package/[jobId] - Generate supplier dispute PDF package

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { jobId } = await params;

    // Get all material data for the job
    const response = await fetch(
      `${req.nextUrl.origin}/api/materials/job/${jobId}`,
      {
        headers: {
          Cookie: req.headers.get("cookie") || "",
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to load material data" },
        { status: 500 }
      );
    }

    const materialData = await response.json();

    // Get job details
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    // Generate PDF HTML
    const pdfHtml = generateDisputePackageHTML(job, materialData);

    // Return HTML (can be converted to PDF using browser print or a service like Puppeteer)
    return new NextResponse(pdfHtml, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="Job-${jobId}-Supplier-Dispute-Packet.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/materials/dispute-package/[jobId]:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generateDisputePackageHTML(job: any, materialData: any): string {
  const shortages = materialData.verifications.filter(
    (v: any) => v.status === "shortage"
  );
  const wrongMaterials = materialData.verifications.filter(
    (v: any) => v.status === "wrong_material"
  );

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Job #${job?.id?.slice(0, 8) || "N/A"} – Supplier Dispute Packet</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      color: #333;
      line-height: 1.6;
    }
    .header {
      border-bottom: 3px solid #f97316;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #f97316;
      margin: 0;
      font-size: 28px;
    }
    .header .subtitle {
      color: #666;
      margin-top: 5px;
    }
    .section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .section h2 {
      color: #f97316;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 20px;
    }
    .info-item {
      padding: 10px;
      background: #f9f9f9;
      border-radius: 5px;
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
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
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
    .alert-box {
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
    }
    .alert-shortage {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
    }
    .alert-wrong {
      background-color: #f8d7da;
      border-left: 4px solid #dc3545;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .photo-item {
      border: 1px solid #ddd;
      border-radius: 5px;
      overflow: hidden;
    }
    .photo-item img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }
    .photo-caption {
      padding: 10px;
      background: #f9f9f9;
      font-size: 12px;
      color: #666;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
    .timestamp {
      color: #999;
      font-size: 11px;
      margin-top: 5px;
    }
    @media print {
      body { margin: 20px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Job #${job?.id?.slice(0, 8) || "N/A"} – Supplier Dispute Packet</h1>
    <div class="subtitle">Material Verification & Delivery Documentation</div>
    <div class="timestamp">Generated: ${new Date().toLocaleString()}</div>
  </div>

  <div class="section">
    <h2>Job Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-label">Job ID</div>
        <div class="info-value">${job?.id || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Address</div>
        <div class="info-value">${job?.address || "N/A"}</div>
      </div>
      <div class="info-item">
        <div class="info-label">Material Health</div>
        <div class="info-value">${materialData.summary.health_percentage}%</div>
      </div>
      <div class="info-item">
        <div class="info-label">Risk Score</div>
        <div class="info-value">${materialData.summary.risk_score}</div>
      </div>
    </div>
  </div>

  ${materialData.deliveries.length > 0 ? `
  <div class="section">
    <h2>Delivery Records</h2>
    ${materialData.deliveries.map((delivery: any) => `
      <div style="margin-bottom: 20px;">
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Supplier</div>
            <div class="info-value">${delivery.supplier || "Not specified"}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Delivered At</div>
            <div class="info-value">${new Date(delivery.delivered_at).toLocaleString()}</div>
          </div>
        </div>
        ${delivery.photo_url ? `
          <div class="photo-item">
            <img src="${delivery.photo_url}" alt="Delivery photo" />
            <div class="photo-caption">Delivery Photo - ${new Date(delivery.delivered_at).toLocaleString()}</div>
          </div>
        ` : ""}
        ${delivery.notes ? `<p style="margin-top: 10px;"><strong>Notes:</strong> ${delivery.notes}</p>` : ""}
      </div>
    `).join("")}
  </div>
  ` : ""}

  <div class="section">
    <h2>Material Verification Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Expected</th>
          <th>Found</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${materialData.items.map((item: any) => {
          const verification = materialData.verifications.find(
            (v: any) => v.material_item_id === item.id
          );
          const status = verification?.status || "pending";
          const statusLabel = status === "matched" ? "✓ Matched" : 
                             status === "shortage" ? "⚠ Shortage" :
                             status === "wrong_material" ? "✗ Wrong Material" :
                             status === "extra" ? "ℹ Extra" : "⏳ Pending";
          
          return `
            <tr>
              <td>${item.name}</td>
              <td>${item.quantity_expected} ${item.unit || "units"}</td>
              <td>${verification?.quantity_found ?? "Not verified"}</td>
              <td>${statusLabel}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  </div>

  ${shortages.length > 0 ? `
  <div class="section">
    <h2>Material Shortages</h2>
    ${shortages.map((verification: any) => {
      const item = materialData.items.find((i: any) => i.id === verification.material_item_id);
      const shortageAmount = (item?.quantity_expected || 0) - (verification.quantity_found || 0);
      
      return `
        <div class="alert-box alert-shortage">
          <strong>${item?.name || "Unknown Material"}</strong><br>
          Expected: ${item?.quantity_expected || 0} ${item?.unit || "units"}<br>
          Found: ${verification.quantity_found || 0} ${item?.unit || "units"}<br>
          <strong>Shortage: ${shortageAmount} ${item?.unit || "units"}</strong><br>
          ${verification.verified_at ? `<div class="timestamp">Verified: ${new Date(verification.verified_at).toLocaleString()}</div>` : ""}
        </div>
        ${verification.photo_url ? `
          <div class="photo-item" style="max-width: 300px; margin-top: 10px;">
            <img src="${verification.photo_url}" alt="Verification photo" />
            <div class="photo-caption">Verification Photo</div>
          </div>
        ` : ""}
      `;
    }).join("")}
  </div>
  ` : ""}

  ${wrongMaterials.length > 0 ? `
  <div class="section">
    <h2>Wrong Materials</h2>
    ${wrongMaterials.map((verification: any) => {
      const item = materialData.items.find((i: any) => i.id === verification.material_item_id);
      
      return `
        <div class="alert-box alert-wrong">
          <strong>${item?.name || "Unknown Material"}</strong><br>
          Expected: ${item?.name || "N/A"}<br>
          Found: Material does not match expected specification<br>
          ${verification.verified_at ? `<div class="timestamp">Verified: ${new Date(verification.verified_at).toLocaleString()}</div>` : ""}
        </div>
        ${verification.photo_url ? `
          <div class="photo-item" style="max-width: 300px; margin-top: 10px;">
            <img src="${verification.photo_url}" alt="Verification photo" />
            <div class="photo-caption">Verification Photo</div>
          </div>
        ` : ""}
      `;
    }).join("")}
  </div>
  ` : ""}

  <div class="section">
    <h2>Verification Timeline</h2>
    <table>
      <thead>
        <tr>
          <th>Material</th>
          <th>Verified By</th>
          <th>Verified At</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${materialData.verifications.map((v: any) => {
          const item = materialData.items.find((i: any) => i.id === v.material_item_id);
          return `
            <tr>
              <td>${item?.name || "Unknown"}</td>
              <td>${v.workforce_employees ? `${v.workforce_employees.first_name} ${v.workforce_employees.last_name}` : "N/A"}</td>
              <td>${v.verified_at ? new Date(v.verified_at).toLocaleString() : "N/A"}</td>
              <td>${v.status}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>This document was generated by SmartSend Material Verification System</p>
    <p>All timestamps are in local time. Photos are timestamped and geotagged where available.</p>
    <p>This is a legal-quality evidence package for supplier disputes.</p>
  </div>
</body>
</html>
  `;
}
























