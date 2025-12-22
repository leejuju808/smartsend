import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/priority/top
 * Block 17600: Returns top N leads by priority score
 * Query params:
 *   - limit: number of leads to return (default: 10)
 *   - workspace_id: workspace ID (optional, uses user's workspace if not provided)
 *   - priority_band: filter by priority band (priority_1, priority_2, etc.)
 *   - high_value_only: only show $15K+ jobs (default: false)
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace ID
  const { searchParams } = new URL(req.url);
  let workspaceId = searchParams.get("workspace_id");
  
  if (!workspaceId) {
    // Get user's workspace from workspace_members
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (!membership?.workspace_id) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }
    
    workspaceId = membership.workspace_id;
  }

  // Verify user has access to this workspace
  const { data: hasAccess } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get query parameters
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const priorityBand = searchParams.get("priority_band");
  const highValueOnly = searchParams.get("high_value_only") === "true";

  try {
    // Build query for priority scores with contact details
    let query = supabase
      .from("priority_scores")
      .select(`
        id,
        contact_id,
        priority_score,
        priority_band,
        heat_score,
        urgency_score,
        insurance_value_score,
        storm_risk_score,
        money_potential_score,
        engagement_score,
        priority_reason,
        next_action,
        is_neglected,
        hours_since_last_touch,
        days_since_last_reply,
        last_calculated_at,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name,
          phone,
          city,
          state,
          zip,
          estimated_value_min,
          estimated_value_max,
          job_type,
          pipeline_stage_key,
          next_appointment_at,
          quote_amount
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("priority_score", { ascending: false })
      .limit(limit);

    // Filter by priority band if specified
    if (priorityBand) {
      query = query.eq("priority_band", priorityBand);
    }

    const { data: priorityScores, error } = await query;

    if (error) {
      throw error;
    }

    // Filter by high value if requested
    let filteredScores = priorityScores || [];
    if (highValueOnly) {
      filteredScores = filteredScores.filter((score: any) => {
        const contact = score.contacts;
        if (!contact) return false;
        
        const minValue = contact.estimated_value_min || 0;
        const maxValue = contact.estimated_value_max || 0;
        const avgValue = (minValue + maxValue) / 2;
        
        return avgValue >= 15000 || contact.job_type === 'insurance_claim' || contact.job_type === 'replacement';
      });
    }

    // Format response
    const leads = filteredScores.map((score: any) => ({
      id: score.contact_id,
      name: score.contacts
        ? `${score.contacts.first_name || ""} ${score.contacts.last_name || ""}`.trim() || score.contacts.email
        : "Unknown",
      email: score.contacts?.email || "",
      phone: score.contacts?.phone || "",
      city: score.contacts?.city || "",
      state: score.contacts?.state || "",
      zip: score.contacts?.zip || "",
      score: score.priority_score,
      priority_band: score.priority_band,
      reason: score.priority_reason || "No reason available",
      next_action: score.next_action || "Follow up",
      is_neglected: score.is_neglected,
      hours_since_last_touch: score.hours_since_last_touch,
      days_since_last_reply: score.days_since_last_reply,
      component_scores: {
        heat: score.heat_score,
        urgency: score.urgency_score,
        insurance_value: score.insurance_value_score,
        storm_risk: score.storm_risk_score,
        money_potential: score.money_potential_score,
        engagement: score.engagement_score,
      },
      contact_details: {
        estimated_value_min: score.contacts?.estimated_value_min,
        estimated_value_max: score.contacts?.estimated_value_max,
        job_type: score.contacts?.job_type,
        pipeline_stage_key: score.contacts?.pipeline_stage_key,
        next_appointment_at: score.contacts?.next_appointment_at,
        quote_amount: score.contacts?.quote_amount,
      },
    }));

    return NextResponse.json({
      leads,
      count: leads.length,
      workspace_id: workspaceId,
    });
  } catch (error: any) {
    console.error("Error fetching top priority leads:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch priority leads" },
      { status: 500 }
    );
  }
}





















































