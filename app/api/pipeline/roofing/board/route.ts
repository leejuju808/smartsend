// Block 73000 — SmartSend Roofing Pipeline Board API
// GET /api/pipeline/roofing/board
// Returns leads grouped by roofing pipeline stages (New Lead, Replied, Estimate Needed, etc.)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create default pipeline stages for this workspace
    const { data: stages, error: stagesError } = await supabase
      .from("pipeline_stages")
      .select("id, name, order_index")
      .eq("workspace_id", workspaceId)
      .order("order_index", { ascending: true });

    // If no stages exist, create default ones
    if ((!stages || stages.length === 0) && !stagesError) {
      const { error: createError } = await supabase.rpc(
        "create_default_roofing_pipeline_stages",
        { p_workspace_id: workspaceId, p_company_id: null }
      );

      if (!createError) {
        // Fetch stages again
        const { data: newStages } = await supabase
          .from("pipeline_stages")
          .select("id, name, order_index")
          .eq("workspace_id", workspaceId)
          .order("order_index", { ascending: true });
        
        if (newStages) {
          stages = newStages;
        }
      }
    }

    // Get all leads with their pipeline status
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        email,
        first_name,
        last_name,
        phone,
        company,
        address,
        city,
        state,
        zip_code,
        intent_classification,
        pipeline_stage_id,
        created_at,
        updated_at,
        lead_pipeline_status:lead_pipeline_status(
          stage_id,
          updated_at,
          pipeline_stages:pipeline_stages(
            id,
            name,
            order_index
          )
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });

    if (leadsError) {
      console.error("[Roofing Pipeline Board] Leads error:", leadsError);
      return NextResponse.json(
        { error: "Failed to fetch leads" },
        { status: 500 }
      );
    }

    // Get estimate requests for leads
    const leadIds = (leads || []).map((l) => l.id);
    const { data: estimateRequests } = await supabase
      .from("estimate_requests")
      .select("id, lead_id, job_type, urgency, created_at")
      .in("lead_id", leadIds.length > 0 ? leadIds : [null])
      .order("created_at", { ascending: false });

    // Get estimates for leads
    const { data: estimates } = await supabase
      .from("estimates")
      .select("id, lead_id, price, sent_at, created_at")
      .in("lead_id", leadIds.length > 0 ? leadIds : [null])
      .order("sent_at", { ascending: false });

    // Get pending followups
    const { data: pendingFollowups } = await supabase
      .from("estimate_followups")
      .select("id, lead_id, estimate_id, due_date, sent, followup_sequence")
      .in("lead_id", leadIds.length > 0 ? leadIds : [null])
      .eq("sent", false)
      .order("due_date", { ascending: true });

    // Group data by lead_id
    const estimateRequestsByLead = new Map<string, any>();
    (estimateRequests || []).forEach((er) => {
      if (er.lead_id) {
        estimateRequestsByLead.set(er.lead_id, er);
      }
    });

    const estimatesByLead = new Map<string, any[]>();
    (estimates || []).forEach((est) => {
      if (est.lead_id) {
        if (!estimatesByLead.has(est.lead_id)) {
          estimatesByLead.set(est.lead_id, []);
        }
        estimatesByLead.get(est.lead_id)!.push(est);
      }
    });

    const followupsByLead = new Map<string, any[]>();
    (pendingFollowups || []).forEach((fup) => {
      if (fup.lead_id) {
        if (!followupsByLead.has(fup.lead_id)) {
          followupsByLead.set(fup.lead_id, []);
        }
        followupsByLead.get(fup.lead_id)!.push(fup);
      }
    });

    // Enrich leads with estimate data
    const enrichedLeads = (leads || []).map((lead) => {
      const pipelineStatus = Array.isArray(lead.lead_pipeline_status)
        ? lead.lead_pipeline_status[0]
        : lead.lead_pipeline_status;

      const stage = pipelineStatus?.pipeline_stages
        ? (Array.isArray(pipelineStatus.pipeline_stages)
            ? pipelineStatus.pipeline_stages[0]
            : pipelineStatus.pipeline_stages)
        : null;

      const estimateRequest = estimateRequestsByLead.get(lead.id);
      const leadEstimates = estimatesByLead.get(lead.id) || [];
      const leadFollowups = followupsByLead.get(lead.id) || [];

      return {
        ...lead,
        stage_name: stage?.name || "New Lead",
        stage_id: stage?.id || null,
        estimate_request: estimateRequest || null,
        estimates: leadEstimates,
        latest_estimate: leadEstimates[0] || null,
        pending_followups: leadFollowups,
        has_pending_followup: leadFollowups.length > 0,
      };
    });

    // Group leads by stage
    const grouped: Record<string, typeof enrichedLeads> = {};

    // Initialize groups with stage names
    (stages || []).forEach((stage) => {
      grouped[stage.name] = [];
    });

    // Fallback if no stages
    if (!stages || stages.length === 0) {
      const defaultStages = [
        "New Lead",
        "Replied",
        "Estimate Needed",
        "Estimate Sent",
        "Follow-Up",
        "Won",
        "Lost",
      ];
      defaultStages.forEach((stageName) => {
        grouped[stageName] = [];
      });
    }

    // Group leads by their current stage
    enrichedLeads.forEach((lead) => {
      const stageName = lead.stage_name || "New Lead";
      if (grouped[stageName]) {
        grouped[stageName].push(lead);
      } else {
        grouped["New Lead"].push(lead);
      }
    });

    // Sort each group by updated_at (most recent first)
    Object.keys(grouped).forEach((stage) => {
      grouped[stage].sort((a, b) => {
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    });

    return NextResponse.json({
      pipeline: grouped,
      stages: stages || [],
      total_leads: enrichedLeads.length,
    });
  } catch (error: any) {
    console.error("[Roofing Pipeline Board] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
