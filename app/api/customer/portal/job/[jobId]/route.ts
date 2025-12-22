// Block 252300 — SmartSend Customer Communication Engine v1
// GET /api/customer/portal/job/:jobId
// Returns portal data for a job (public access via tokenized jobId)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    if (!jobId) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    // Try to get job_id from portal code first
    const { data: portalToken } = await supabase.rpc("get_job_from_portal_code", {
      p_code: jobId,
    });

    // Use portal code result or try jobId as UUID
    const actualJobId = portalToken || jobId;

    // Get job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(`
        id,
        title,
        status,
        scheduled_date,
        production_date,
        address,
        homeowner_name,
        homeowner_phone,
        homeowner_email,
        company_id,
        crew_id
      `)
      .eq("id", actualJobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found or access denied" },
        { status: 404 }
      );
    }

    // Get milestones
    const { data: milestones } = await supabase
      .from("production_milestones")
      .select("id, name, status, completed_date, scheduled_date")
      .eq("job_id", job.id)
      .order("order_index", { ascending: true });

    // Get photos
    const { data: photos } = await supabase
      .from("job_photo_entries")
      .select("id, url, stage, label, created_at")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });

    // Get communication events (messages)
    const { data: messages } = await supabase
      .from("communication_events")
      .select("id, event_type, message_body, sent_at, metadata")
      .eq("job_id", job.id)
      .order("sent_at", { ascending: false });

    // Get foreman info if crew is assigned
    let foreman = null;
    if (job.crew_id) {
      const { data: crew } = await supabase
        .from("crews")
        .select(`
          foreman_id,
          workforce_employees:foreman_id (
            first_name,
            last_name,
            phone
          )
        `)
        .eq("id", job.crew_id)
        .single();

      if (crew && crew.workforce_employees) {
        const emp = crew.workforce_employees as any;
        foreman = {
          name: `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || null,
          phone: emp.phone || null,
        };
      }
    }

    // Build timeline from milestones and messages
    const timeline: Array<{
      id: string;
      event_type: string;
      message: string;
      timestamp: string;
      metadata: any;
    }> = [];

    // Add milestone events
    milestones?.forEach((milestone) => {
      if (milestone.status === "completed" && milestone.completed_date) {
        timeline.push({
          id: `milestone-${milestone.id}`,
          event_type: "milestone_completed",
          message: `✓ ${milestone.name} completed`,
          timestamp: milestone.completed_date,
          metadata: { milestone_id: milestone.id },
        });
      } else if (milestone.status === "in_progress") {
        timeline.push({
          id: `milestone-${milestone.id}`,
          event_type: "milestone_started",
          message: `→ ${milestone.name} started`,
          timestamp: milestone.scheduled_date || new Date().toISOString(),
          metadata: { milestone_id: milestone.id },
        });
      }
    });

    // Add message events
    messages?.forEach((msg) => {
      timeline.push({
        id: `msg-${msg.id}`,
        event_type: msg.event_type,
        message: msg.message_body,
        timestamp: msg.sent_at,
        metadata: msg.metadata,
      });
    });

    // Sort timeline by timestamp
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Generate warranty link (in production, this would be a proper portal token)
    const warrantyLink = job.status === "completed"
      ? `/customer/j/${jobId}/warranty`
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        job: {
          id: job.id,
          title: job.title || "Roofing Project",
          status: job.status,
          scheduled_date: job.scheduled_date,
          production_date: job.production_date,
          address: job.address,
          homeowner_name: job.homeowner_name,
          homeowner_phone: job.homeowner_phone,
          homeowner_email: job.homeowner_email,
        },
        milestones: milestones || [],
        photos: photos || [],
        messages: messages || [],
        timeline,
        foreman,
        warranty_link: warrantyLink,
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/customer/portal/job/[jobId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























