import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/appointment-form
 * Submit pre-appointment intelligence form
 * Body:
 * {
 *   booking_id: uuid (required)
 *   has_leaks?: boolean
 *   recent_storms?: boolean
 *   insurance_claim_filed?: boolean
 *   last_inspection_date?: string (YYYY-MM-DD)
 *   roof_issue_type?: "leak" | "storm_damage" | "missing_shingles" | "routine_check" | "insurance_claim" | "not_sure"
 *   issue_description?: string
 *   photo_urls?: string[]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();
    const supabaseAdmin = createServiceClient();

    const body = await req.json();
    const {
      booking_id,
      has_leaks,
      recent_storms,
      insurance_claim_filed,
      last_inspection_date,
      roof_issue_type,
      issue_description,
      photo_urls = [],
    } = body;

    if (!booking_id) {
      return NextResponse.json(
        { error: "booking_id is required" },
        { status: 400 }
      );
    }

    // Verify booking exists and belongs to workspace
    const { data: booking, error: bookingError } = await supabase
      .from("schedule_bookings")
      .select("id, workspace_id, contact_id")
      .eq("id", booking_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // Process AI insights
    const aiInsights = await processAppointmentFormAI({
      has_leaks,
      recent_storms,
      insurance_claim_filed,
      roof_issue_type,
      issue_description,
    });

    // Determine urgency from insights
    const urgency = aiInsights.urgency || "medium";

    // Determine if urgent or insurance lead
    const urgentLead =
      has_leaks ||
      (recent_storms && roof_issue_type === "storm_damage") ||
      urgency === "high" ||
      urgency === "urgent";
    const insuranceLead = insurance_claim_filed || roof_issue_type === "insurance_claim";

    // Create or update appointment form
    const { data: existingForm } = await supabase
      .from("appointment_forms")
      .select("id")
      .eq("booking_id", booking_id)
      .single();

    const formData = {
      booking_id,
      workspace_id,
      has_leaks: has_leaks ?? null,
      recent_storms: recent_storms ?? null,
      insurance_claim_filed: insurance_claim_filed ?? null,
      last_inspection_date: last_inspection_date || null,
      roof_issue_type: roof_issue_type || null,
      issue_description: issue_description || null,
      photo_urls: photo_urls.length > 0 ? JSON.stringify(photo_urls) : "[]",
      ai_insights: aiInsights,
      insurance_lead: insuranceLead,
      urgent_lead: urgentLead,
      updated_at: new Date().toISOString(),
    };

    let formId;
    if (existingForm) {
      const { data, error } = await supabase
        .from("appointment_forms")
        .update(formData)
        .eq("id", existingForm.id)
        .select("id")
        .single();

      if (error) {
        console.error("Error updating appointment form:", error);
        return NextResponse.json(
          { error: "Failed to update form", details: error.message },
          { status: 500 }
        );
      }
      formId = data.id;
    } else {
      const { data, error } = await supabase
        .from("appointment_forms")
        .insert(formData)
        .select("id")
        .single();

      if (error) {
        console.error("Error creating appointment form:", error);
        return NextResponse.json(
          { error: "Failed to create form", details: error.message },
          { status: 500 }
        );
      }
      formId = data.id;
    }

    // Update booking with insights
    const stormRisk = determineStormRisk(recent_storms, roof_issue_type, urgency);
    await supabaseAdmin
      .from("schedule_bookings")
      .update({
        storm_risk: stormRisk,
        pre_inspection_notes: issue_description || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id);

    // Update contact with tags if contact exists
    if (booking.contact_id) {
      const tagsToAdd: string[] = [];
      if (insuranceLead) tagsToAdd.push("insurance_lead");
      if (urgentLead) tagsToAdd.push("urgent");
      if (has_leaks) tagsToAdd.push("leak_issue");
      if (recent_storms) tagsToAdd.push("storm_damage");

      if (tagsToAdd.length > 0) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("tags")
          .eq("id", booking.contact_id)
          .single();

        const existingTags = (contact?.tags as string[]) || [];
        const newTags = Array.from(new Set([...existingTags, ...tagsToAdd]));

        await supabase
          .from("contacts")
          .update({ tags: newTags })
          .eq("id", booking.contact_id);
      }
    }

    return NextResponse.json({
      success: true,
      form_id: formId,
      ai_insights: aiInsights,
      urgent_lead: urgentLead,
      insurance_lead: insuranceLead,
    });
  } catch (error: any) {
    console.error("Error in appointment-form endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

async function processAppointmentFormAI(data: {
  has_leaks?: boolean;
  recent_storms?: boolean;
  insurance_claim_filed?: boolean;
  roof_issue_type?: string;
  issue_description?: string;
}): Promise<Record<string, any>> {
  // Simple AI processing - can be enhanced with actual AI model
  const insights: Record<string, any> = {
    lead_score: 50,
    urgency: "medium",
    recommended_templates: [],
  };

  if (data.has_leaks) {
    insights.lead_score += 20;
    insights.urgency = "high";
    insights.recommended_templates.push("leak_inspection");
  }

  if (data.recent_storms || data.roof_issue_type === "storm_damage") {
    insights.lead_score += 25;
    insights.urgency = insights.urgency === "high" ? "urgent" : "high";
    insights.recommended_templates.push("storm_damage_assessment");
  }

  if (data.insurance_claim_filed || data.roof_issue_type === "insurance_claim") {
    insights.lead_score += 30;
    insights.recommended_templates.push("insurance_inspection");
  }

  return insights;
}

function determineStormRisk(
  recentStorms?: boolean,
  roofIssueType?: string,
  urgency?: string
): "none" | "low" | "medium" | "high" | "urgent" {
  if (urgency === "urgent" || (recentStorms && roofIssueType === "storm_damage")) {
    return "urgent";
  }
  if (urgency === "high" || recentStorms) {
    return "high";
  }
  if (roofIssueType === "storm_damage") {
    return "medium";
  }
  return "none";
}

