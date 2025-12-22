// Block 22370 — SmartSend Roofing Lead → Job Auto-Conversion v1
// API Route: Convert Lead to Job
// POST /api/leads/[id]/convert

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const leadId = id;

    // 1. Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // 2. Check if already converted
    if (lead.converted_to_job) {
      return NextResponse.json(
        {
          error: "Lead already converted",
          job_id: lead.converted_job_id,
        },
        { status: 400 }
      );
    }

    // 3. Get workspace_id (required for job creation)
    const workspaceId = lead.workspace_id;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Lead missing workspace_id" },
        { status: 400 }
      );
    }

    // 4. Fetch proposals for this lead
    const { data: proposalsData } = await supabase
      .from("proposals")
      .select("id, amount, status")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false });

    // Get the best proposal (approved > sent > viewed > first)
    const proposals = proposalsData || [];
    const proposal = proposals.find((p: any) => p.status === 'approved') ||
                     proposals.find((p: any) => p.status === 'sent') ||
                     proposals.find((p: any) => p.status === 'viewed') ||
                     proposals[0];
    
    const jobValue = proposal?.amount || lead.estimated_job_value || 0;

    // 5. Create job title
    const homeownerName = lead.name || 
      (lead.first_name && lead.last_name 
        ? `${lead.first_name} ${lead.last_name}` 
        : lead.first_name || lead.last_name || 'Homeowner');
    
    const jobTitle = `Roof Replacement — ${homeownerName}`;

    // 6. Create job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .insert({
        workspace_id: workspaceId,
        lead_id: leadId,
        proposal_id: proposal?.id || null,

        title: jobTitle,
        job_value: jobValue,
        status: "unscheduled", // Using 'unscheduled' instead of 'awaiting_scheduling' to match existing schema

        homeowner_name: homeownerName,
        homeowner_email: lead.email || null,
        homeowner_phone: lead.phone || null,

        address: lead.address || null,
        city: lead.city || null,
        state: lead.state || null,
        zip: lead.zip || null,
      })
      .select("*")
      .single();

    if (jobError) {
      console.error("Job creation error:", jobError);
      return NextResponse.json(
        { error: `Failed to create job: ${jobError.message}` },
        { status: 500 }
      );
    }

    const jobId = job.id;

    // 7. Mark lead as converted
    const { error: updateLeadError } = await supabase
      .from("leads")
      .update({
        converted_to_job: true,
        converted_job_id: jobId,
      })
      .eq("id", leadId);

    if (updateLeadError) {
      console.error("Lead update error:", updateLeadError);
      // Don't fail the request, but log it
    }

    // 8. Create material order shell
    const { error: materialOrderError } = await supabase
      .from("material_orders")
      .insert({
        workspace_id: workspaceId,
        job_id: jobId,
        status: "not_ordered",
      });

    if (materialOrderError) {
      console.error("Material order creation error:", materialOrderError);
      // Don't fail the request, but log it
    }

    // 9. Create job activity entry
    const { error: activityError } = await supabase
      .from("job_activity")
      .insert({
        job_id: jobId,
        type: "job_created",
        message: `Job created from lead for ${homeownerName}`,
      });

    if (activityError) {
      console.error("Job activity creation error:", activityError);
      // Also try job_events table (alternative)
      await supabase.from("job_events").insert({
        job_id: jobId,
        workspace_id: workspaceId,
        lead_id: leadId,
        event_type: "job_created",
        metadata: {
          lead_id: leadId,
          homeowner_name: homeownerName,
        },
      });
    }

    // 10. Add timeline entry
    const { error: timelineError } = await supabase
      .from("job_timeline")
      .insert({
        job_id: jobId,
        event_type: "conversion",
        description: "Lead converted into job",
      });

    if (timelineError) {
      console.error("Job timeline creation error:", timelineError);
      // Don't fail the request, but log it
    }

    // 11. Add kickoff tasks
    const kickoffTasks = [
      {
        job_id: jobId,
        name: "Call homeowner to confirm details",
        status: "pending",
      },
      {
        job_id: jobId,
        name: "Schedule job dates",
        status: "pending",
      },
      {
        job_id: jobId,
        name: "Order materials",
        status: "pending",
      },
    ];

    const { error: tasksError } = await supabase
      .from("job_tasks")
      .insert(kickoffTasks);

    if (tasksError) {
      console.error("Job tasks creation error:", tasksError);
      // Don't fail the request, but log it
    }

    // 12. Update proposal to link to job (if proposal exists)
    if (proposal?.id) {
      await supabase
        .from("proposals")
        .update({ job_id: jobId })
        .eq("id", proposal.id);
    }

    return NextResponse.json(
      {
        success: true,
        job_id: jobId,
        message: "Lead successfully converted to Job",
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Convert lead error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

