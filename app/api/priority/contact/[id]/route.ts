import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/priority/contact/[id]
 * Block 17600: Returns priority score for a specific contact
 * Also triggers recalculation if score is stale (older than 1 hour)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contactId = params.id;

  if (!contactId) {
    return NextResponse.json({ error: "Contact ID required" }, { status: 400 });
  }

  try {
    // Get contact to verify workspace access
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Verify user has access to this workspace
    const { data: hasAccess } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", contact.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get priority score
    const { data: priorityScore, error: scoreError } = await supabase
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
        last_calculated_at
      `)
      .eq("contact_id", contactId)
      .single();

    // If score doesn't exist or is stale (older than 1 hour), recalculate
    const shouldRecalculate = 
      !priorityScore || 
      !priorityScore.last_calculated_at ||
      new Date(priorityScore.last_calculated_at).getTime() < Date.now() - 3600000; // 1 hour

    if (shouldRecalculate) {
      // Trigger recalculation
      const { error: calcError } = await supabase.rpc("calculate_contact_priority", {
        p_contact_id: contactId,
      });

      if (calcError) {
        console.warn("Error recalculating priority:", calcError);
      }

      // Fetch updated score
      const { data: updatedScore, error: updatedError } = await supabase
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
          last_calculated_at
        `)
        .eq("contact_id", contactId)
        .single();

      if (updatedError) {
        throw updatedError;
      }

      return NextResponse.json({
        contact_id: contactId,
        priority_score: updatedScore?.priority_score || 0,
        priority_band: updatedScore?.priority_band || "priority_5",
        component_scores: {
          heat: updatedScore?.heat_score || 0,
          urgency: updatedScore?.urgency_score || 0,
          insurance_value: updatedScore?.insurance_value_score || 0,
          storm_risk: updatedScore?.storm_risk_score || 0,
          money_potential: updatedScore?.money_potential_score || 0,
          engagement: updatedScore?.engagement_score || 0,
        },
        priority_reason: updatedScore?.priority_reason || "",
        next_action: updatedScore?.next_action || "Follow up",
        is_neglected: updatedScore?.is_neglected || false,
        hours_since_last_touch: updatedScore?.hours_since_last_touch || 0,
        days_since_last_reply: updatedScore?.days_since_last_reply || 0,
        last_calculated_at: updatedScore?.last_calculated_at,
        recalculated: true,
      });
    }

    // Return existing score
    return NextResponse.json({
      contact_id: contactId,
      priority_score: priorityScore?.priority_score || 0,
      priority_band: priorityScore?.priority_band || "priority_5",
      component_scores: {
        heat: priorityScore?.heat_score || 0,
        urgency: priorityScore?.urgency_score || 0,
        insurance_value: priorityScore?.insurance_value_score || 0,
        storm_risk: priorityScore?.storm_risk_score || 0,
        money_potential: priorityScore?.money_potential_score || 0,
        engagement: priorityScore?.engagement_score || 0,
      },
      priority_reason: priorityScore?.priority_reason || "",
      next_action: priorityScore?.next_action || "Follow up",
      is_neglected: priorityScore?.is_neglected || false,
      hours_since_last_touch: priorityScore?.hours_since_last_touch || 0,
      days_since_last_reply: priorityScore?.days_since_last_reply || 0,
      last_calculated_at: priorityScore?.last_calculated_at,
      recalculated: false,
    });
  } catch (error: any) {
    console.error("Error fetching contact priority:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch priority score" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/priority/contact/[id]
 * Block 17600: Manually trigger priority recalculation for a contact
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contactId = params.id;

  if (!contactId) {
    return NextResponse.json({ error: "Contact ID required" }, { status: 400 });
  }

  try {
    // Get contact to verify workspace access
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Verify user has access to this workspace
    const { data: hasAccess } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", contact.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Trigger recalculation
    const { error: calcError } = await supabase.rpc("calculate_contact_priority", {
      p_contact_id: contactId,
    });

    if (calcError) {
      throw calcError;
    }

    // Fetch updated score
    const { data: updatedScore, error: updatedError } = await supabase
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
        last_calculated_at
      `)
      .eq("contact_id", contactId)
      .single();

    if (updatedError) {
      throw updatedError;
    }

    return NextResponse.json({
      contact_id: contactId,
      priority_score: updatedScore?.priority_score || 0,
      priority_band: updatedScore?.priority_band || "priority_5",
      component_scores: {
        heat: updatedScore?.heat_score || 0,
        urgency: updatedScore?.urgency_score || 0,
        insurance_value: updatedScore?.insurance_value_score || 0,
        storm_risk: updatedScore?.storm_risk_score || 0,
        money_potential: updatedScore?.money_potential_score || 0,
        engagement: updatedScore?.engagement_score || 0,
      },
      priority_reason: updatedScore?.priority_reason || "",
      next_action: updatedScore?.next_action || "Follow up",
      is_neglected: updatedScore?.is_neglected || false,
      hours_since_last_touch: updatedScore?.hours_since_last_touch || 0,
      days_since_last_reply: updatedScore?.days_since_last_reply || 0,
      last_calculated_at: updatedScore?.last_calculated_at,
      message: "Priority score recalculated successfully",
    });
  } catch (error: any) {
    console.error("Error recalculating contact priority:", error);
    return NextResponse.json(
      { error: error.message || "Failed to recalculate priority score" },
      { status: 500 }
    );
  }
}





















































