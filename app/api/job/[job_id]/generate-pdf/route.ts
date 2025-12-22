// Block 26940 — SmartSend Roofing Field Photo & Document Intelligence v1
// API Route: Generate Inspection PDF
// POST /api/job/[job_id]/generate-pdf

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await serviceSupabase
      .from("roofing_jobs")
      .select("id, homeowner_name, address, carrier, claim_number, inspection_summary, supplement_line_items, insurance_notes")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get all photos
    const { data: photos, error: photosError } = await serviceSupabase
      .from("roofing_field_photos")
      .select("id, category, damage_labels, ai_summary, storage_path")
      .eq("job_id", job_id)
      .order("created_at", { ascending: true });

    if (photosError) {
      console.error("Error fetching photos:", photosError);
    }

    // Get public URLs for photos
    const photosWithUrls = (photos || []).map((photo) => {
      const { data: urlData } = serviceSupabase.storage
        .from("job-photos")
        .getPublicUrl(photo.storage_path);

      return {
        ...photo,
        url: urlData.publicUrl,
      };
    });

    // Group photos by category
    const photosByCategory: Record<string, typeof photosWithUrls> = {};
    photosWithUrls.forEach((photo) => {
      const category = photo.category || "uncategorized";
      if (!photosByCategory[category]) {
        photosByCategory[category] = [];
      }
      photosByCategory[category].push(photo);
    });

    // Generate HTML for PDF
    const htmlContent = generateInspectionPDFHTML(job, photosWithUrls, photosByCategory);

    // Return HTML (can be converted to PDF using browser print or a service like Puppeteer)
    return new NextResponse(htmlContent, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="inspection-report-${job_id}.html"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function generateInspectionPDFHTML(
  job: any,
  photos: any[],
  photosByCategory: Record<string, any[]>
): string {
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Generate photo grid HTML
  const photoGridHTML = Object.entries(photosByCategory)
    .map(([category, categoryPhotos]) => {
      const photoItems = categoryPhotos
        .map((photo) => {
          const damageLabels = photo.damage_labels?.length > 0
            ? `<div class="damage-labels">${photo.damage_labels.map((label: string) => `<span class="damage-badge">${label.replace(/_/g, " ")}</span>`).join("")}</div>`
            : "";

          return `
            <div class="photo-item">
              <img src="${photo.url}" alt="${category}" />
              <div class="photo-info">
                <div class="photo-category">${category.replace(/_/g, " ")}</div>
                ${damageLabels}
                ${photo.ai_summary ? `<div class="photo-summary">${photo.ai_summary}</div>` : ""}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="category-section">
          <h3>${category.replace(/_/g, " ").toUpperCase()} (${categoryPhotos.length})</h3>
          <div class="photo-grid">
            ${photoItems}
          </div>
        </div>
      `;
    })
    .join("");

  // Generate line items HTML
  const lineItemsHTML = job.supplement_line_items && job.supplement_line_items.length > 0
    ? `
      <div class="section">
        <h2>Suggested Supplement Line Items</h2>
        <ul class="line-items">
          ${job.supplement_line_items.map((item: string) => `<li>${item}</li>`).join("")}
        </ul>
      </div>
    `
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Roofing Inspection Report - ${job.id}</title>
  <style>
    @media print {
      @page {
        margin: 1cm;
      }
      body {
        margin: 0;
      }
      .no-print {
        display: none;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
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
    .report-title {
      font-size: 32px;
      font-weight: bold;
      margin: 20px 0;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
      flex-wrap: wrap;
    }
    .info-column {
      flex: 1;
      min-width: 250px;
      margin-bottom: 20px;
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
    .summary-box {
      background: #eff6ff;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #2563eb;
      margin: 20px 0;
    }
    .summary-box p {
      margin: 0;
      line-height: 1.8;
      color: #1e40af;
      white-space: pre-line;
    }
    .category-section {
      margin: 30px 0;
    }
    .category-section h3 {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #2563eb;
      text-transform: capitalize;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
      margin: 20px 0;
    }
    .photo-item {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      background: #f9fafb;
    }
    .photo-item img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
    }
    .photo-info {
      padding: 10px;
    }
    .photo-category {
      font-weight: bold;
      font-size: 12px;
      color: #2563eb;
      margin-bottom: 5px;
      text-transform: capitalize;
    }
    .damage-labels {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin: 8px 0;
    }
    .damage-badge {
      background: #fee2e2;
      color: #991b1b;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
    }
    .photo-summary {
      font-size: 11px;
      color: #666;
      margin-top: 8px;
      line-height: 1.4;
    }
    .line-items {
      list-style: none;
      padding: 0;
    }
    .line-items li {
      padding: 10px;
      margin: 8px 0;
      background: #f9fafb;
      border-left: 3px solid #2563eb;
      border-radius: 4px;
    }
    .insurance-notes {
      background: #fef3c7;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #f59e0b;
      margin: 20px 0;
    }
    .insurance-notes p {
      margin: 0;
      line-height: 1.8;
      color: #92400e;
      white-space: pre-line;
    }
    .footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .print-button:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">Print / Save as PDF</button>

  <div class="header">
    <div class="company-name">SmartSend Roofing</div>
    <div class="report-title">ROOFING INSPECTION REPORT</div>
  </div>

  <div class="info-section">
    <div class="info-column">
      <div class="info-label">Homeowner</div>
      <div class="info-value">${job.homeowner_name || "N/A"}</div>
      
      <div class="info-label">Address</div>
      <div class="info-value">${job.address || "N/A"}</div>
    </div>
    <div class="info-column">
      <div class="info-label">Insurance Carrier</div>
      <div class="info-value">${job.carrier || "N/A"}</div>
      
      <div class="info-label">Claim Number</div>
      <div class="info-value">${job.claim_number || "N/A"}</div>
    </div>
    <div class="info-column">
      <div class="info-label">Report Date</div>
      <div class="info-value">${date}</div>
      
      <div class="info-label">Total Photos</div>
      <div class="info-value">${photos.length}</div>
    </div>
  </div>

  ${job.inspection_summary ? `
    <div class="section">
      <h2>Inspection Summary</h2>
      <div class="summary-box">
        <p>${job.inspection_summary}</p>
      </div>
    </div>
  ` : ""}

  ${lineItemsHTML}

  ${job.insurance_notes ? `
    <div class="section">
      <h2>Insurance Justification</h2>
      <div class="insurance-notes">
        <p>${job.insurance_notes}</p>
      </div>
    </div>
  ` : ""}

  <div class="section">
    <h2>Photo Documentation</h2>
    ${photoGridHTML}
  </div>

  <div class="footer">
    <p>Generated by SmartSend Roofing Intelligence System</p>
    <p>Report ID: ${job.id} | Generated: ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
  `;
}



































