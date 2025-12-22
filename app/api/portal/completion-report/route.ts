// Block 200000 — SmartSend Roofing Homeowner Portal Completion Report PDF Generator
// POST /api/portal/completion-report
// Generates final completion report PDF for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Get job data
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get portal
    const { data: portal } = await supabase
      .from("homeowner_portals")
      .select("*")
      .eq("job_id", jobId)
      .eq("is_active", true)
      .single();

    if (!portal) {
      return NextResponse.json(
        { error: "Portal not found for this job" },
        { status: 404 }
      );
    }

    // Get all relevant data for PDF
    const [photos, timeline, insurance, measurement] = await Promise.all([
      supabase.from("homeowner_photo_feed").select("*").eq("job_id", jobId),
      supabase.from("homeowner_portal_events").select("*").eq("job_id", jobId).order("created_at", { ascending: true }),
      supabase.from("job_insurance_claims").select("*").eq("job_id", jobId).single(),
      supabase.from("roof_measurement_data").select("*").eq("job_id", jobId).single(),
    ]);

    // TODO: Generate PDF using a PDF library (e.g., pdfkit, puppeteer, or @react-pdf/renderer)
    // For now, return a placeholder response
    
    // In production, you would:
    // 1. Use a PDF library to generate the report
    // 2. Upload to Supabase Storage
    // 3. Save the URL to homeowner_portal_completion_reports
    // 4. Return the PDF URL

    const reportData = {
      job,
      portal,
      photos: photos.data || [],
      timeline: timeline.data || [],
      insurance: insurance.data || null,
      measurement: measurement.data || null,
      generated_at: new Date().toISOString(),
    };

    // Placeholder: In production, generate actual PDF
    // For now, we'll create a record and return a note that PDF generation needs to be implemented
    const { data: report, error: reportError } = await supabase
      .from("homeowner_portal_completion_reports")
      .insert({
        portal_id: portal.id,
        job_id: jobId,
        report_pdf_url: `https://portal.smartsendhq.com/reports/${jobId}.pdf`, // Placeholder
        report_pdf_path: `reports/${jobId}.pdf`, // Placeholder
        metadata: reportData,
      })
      .select()
      .single();

    if (reportError) {
      return NextResponse.json(
        { error: "Failed to create completion report" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      report,
      note: "PDF generation requires implementation with a PDF library (e.g., pdfkit or puppeteer)",
      reportData, // Return data structure for PDF generation
    });
  } catch (error: any) {
    console.error("Completion report generation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/portal/completion-report?jobId=xxx - Get completion report
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    const { data: report, error } = await supabase
      .from("homeowner_portal_completion_reports")
      .select("*")
      .eq("job_id", jobId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ report });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























