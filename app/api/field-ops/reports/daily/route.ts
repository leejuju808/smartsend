// Block 255400 — Field Operations Command v1
// API Route: Daily Production Reports
// GET /api/field-ops/reports/daily

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const reportDate = searchParams.get("date") || new Date().toISOString().split("T")[0];

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, title, address, job_type")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      // Try jobs table
      const { data: jobAlt, error: jobAltError } = await supabase
        .from("jobs")
        .select("id, team_id, address, job_type")
        .eq("id", jobId)
        .single();

      if (jobAltError || !jobAlt) {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }

      // Verify team access
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("team_id", jobAlt.team_id)
        .eq("user_id", user.id)
        .single();

      if (!teamMember) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    } else {
      // Verify workspace access
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", job.workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!membership) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Get or create foreman report
    let { data: report, error: reportError } = await supabase
      .from("foreman_reports")
      .select("*")
      .eq("job_id", jobId)
      .eq("report_date", reportDate)
      .single();

    // If report doesn't exist, generate one from job data
    if (reportError || !report) {
      // Get job timeline
      const { data: timeline } = await supabase
        .from("jobsite_status_updates")
        .select("status, timestamp, notes")
        .eq("job_id", jobId)
        .gte("timestamp", `${reportDate}T00:00:00`)
        .lt("timestamp", `${reportDate}T23:59:59`)
        .order("timestamp", { ascending: true });

      // Get photos
      const { data: photos } = await supabase
        .from("job_photos")
        .select("url, category, created_at")
        .eq("job_id", jobId)
        .gte("created_at", `${reportDate}T00:00:00`)
        .lt("created_at", `${reportDate}T23:59:59`)
        .order("created_at", { ascending: true });

      // Get material usage
      const { data: materials } = await supabase
        .from("material_usage")
        .select("material_name, quantity, unit")
        .eq("job_id", jobId)
        .gte("created_at", `${reportDate}T00:00:00`)
        .lt("created_at", `${reportDate}T23:59:59`);

      // Get crew hours (if crew_hours table exists)
      const { data: crewHours } = await supabase
        .from("crew_hours")
        .select("start_time, end_time, crew_size, hourly_rate, work_type")
        .eq("job_id", jobId)
        .gte("start_time", `${reportDate}T00:00:00`)
        .lt("start_time", `${reportDate}T23:59:59`);

      // Get punchlist items
      const { data: punchlists } = await supabase
        .from("punchlists")
        .select("item, status, priority")
        .eq("job_id", jobId);

      // Get issues from status updates
      const issues = timeline?.filter((t: any) => t.status === "issue") || [];

      // Calculate hours worked
      let totalHours = 0;
      let laborCost = 0;
      if (crewHours && crewHours.length > 0) {
        crewHours.forEach((ch: any) => {
          if (ch.start_time && ch.end_time) {
            const start = new Date(ch.start_time);
            const end = new Date(ch.end_time);
            const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            totalHours += hours * (ch.crew_size || 1);
            laborCost += hours * (ch.crew_size || 1) * (ch.hourly_rate || 0);
          }
        });
      }

      // Build report JSON
      const reportData = {
        materials_used: materials || [],
        hours_worked: {
          total_hours: totalHours,
          labor_cost: laborCost,
          entries: crewHours || [],
        },
        issues: issues.map((i: any) => ({
          timestamp: i.timestamp,
          notes: i.notes,
        })),
        photos: photos || [],
        delay_notes: issues
          .filter((i: any) => i.notes?.toLowerCase().includes("delay"))
          .map((i: any) => i.notes)
          .join("; "),
        cleanup_confirmation: timeline?.some((t: any) => t.status === "cleanup") || false,
        start_time: timeline?.[0]?.timestamp || null,
        stop_time: timeline?.[timeline.length - 1]?.timestamp || null,
        labor_hours: {
          total: totalHours,
          cost: laborCost,
        },
        punchlist_summary: {
          total: punchlists?.length || 0,
          open: punchlists?.filter((p: any) => p.status === "open").length || 0,
          completed: punchlists?.filter((p: any) => p.status === "completed").length || 0,
        },
      };

      // Create report
      const { data: newReport, error: createError } = await supabase
        .from("foreman_reports")
        .insert({
          job_id: jobId,
          report_date: reportDate,
          report: reportData,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating report:", createError);
        return NextResponse.json(
          { error: createError.message },
          { status: 400 }
        );
      }

      report = newReport;
    }

    // Return report with job details
    return NextResponse.json(
      {
        report: {
          ...report,
          job_title: job?.title || "Untitled Job",
          job_address: job?.address || "No address",
          job_type: job?.job_type || null,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in daily reports endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// POST: Generate PDF report (placeholder - would integrate with PDF generation service)
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const body = await req.json();
    const { job_id, report_date } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get report data (same as GET)
    const reportResponse = await GET(
      new NextRequest(
        new URL(`/api/field-ops/reports/daily?job_id=${job_id}&date=${report_date || new Date().toISOString().split("T")[0]}`, req.url)
      )
    );

    if (!reportResponse.ok) {
      return reportResponse;
    }

    const { report } = await reportResponse.json();

    // TODO: Generate PDF using a PDF generation library (e.g., pdfkit, puppeteer)
    // For now, return the report data with a note that PDF generation would happen here
    // In production, you would:
    // 1. Use a PDF generation service/library
    // 2. Upload PDF to storage (S3, Supabase Storage, etc.)
    // 3. Update foreman_reports.pdf_url
    // 4. Return PDF URL

    return NextResponse.json(
      {
        message: "PDF generation would happen here",
        report,
        pdf_url: null, // Would be set after PDF generation
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in PDF generation endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















