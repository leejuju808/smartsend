import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/revenue/contact/[id]
 * Block 16400: Returns revenue data for a specific contact
 * Includes: Estimated job value, job type, close probability, insurance claim data, revenue timeline
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

  try {
    // Get contact with revenue data
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select(`
        id,
        email,
        first_name,
        last_name,
        lead_score,
        lead_status,
        job_type,
        revenue_category,
        estimated_value_min,
        estimated_value_max,
        estimated_value_confidence,
        close_probability,
        estimated_close_date,
        quote_amount,
        quote_sent_at,
        last_quote_amount,
        insurance_claim_value_min,
        insurance_claim_value_max,
        insurance_deductible,
        insurance_claim_type,
        storm_impact_severity,
        high_value_flag,
        home_value,
        roof_size_sqft,
        roof_age_years,
        workspace_id
      `)
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this contact's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", contact.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get close probability details
    const { data: closeProbData } = await supabase
      .from("close_probability")
      .select("*")
      .eq("contact_id", contactId)
      .single();

    // Get revenue events timeline
    const { data: revenueEvents } = await supabase
      .from("revenue_events")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get job estimates history
    const { data: jobEstimates } = await supabase
      .from("job_estimates")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Calculate estimated job value average
    const estimatedJobValue = contact.estimated_value_min && contact.estimated_value_max
      ? (contact.estimated_value_min + contact.estimated_value_max) / 2
      : contact.estimated_value_min || null;

    // Determine recommended next step
    let recommendedNextStep = "Continue outreach";
    if (!contact.quote_sent_at && contact.close_probability && contact.close_probability >= 70) {
      recommendedNextStep = "Send quote";
    } else if (contact.quote_sent_at) {
      const daysSinceQuote = Math.floor(
        (new Date().getTime() - new Date(contact.quote_sent_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceQuote > 7) {
        recommendedNextStep = "Follow up on quote";
      } else {
        recommendedNextStep = "Wait for response";
      }
    } else if (contact.lead_status === 'hot') {
      recommendedNextStep = "Schedule inspection";
    } else if (contact.storm_impact_severity === 'high') {
      recommendedNextStep = "Prioritize storm follow-up";
    }

    // Build revenue timeline
    const revenueTimeline = revenueEvents?.map(event => ({
      id: event.id,
      type: event.event_type,
      reason: event.reason,
      source: event.source,
      timestamp: event.created_at,
      changes: {
        jobType: event.old_job_type !== event.new_job_type
          ? { from: event.old_job_type, to: event.new_job_type }
          : null,
        value: (event.old_value_min !== event.new_value_min || event.old_value_max !== event.new_value_max)
          ? {
              from: event.old_value_min && event.old_value_max
                ? { min: event.old_value_min, max: event.old_value_max }
                : null,
              to: event.new_value_min && event.new_value_max
                ? { min: event.new_value_min, max: event.new_value_max }
                : null
            }
          : null,
        closeProbability: event.old_close_probability !== event.new_close_probability
          ? { from: event.old_close_probability, to: event.new_close_probability }
          : null,
        quoteAmount: event.quote_amount || null
      },
      metadata: event.metadata
    })) || [];

    return NextResponse.json({
      ok: true,
      contact: {
        id: contact.id,
        email: contact.email,
        name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email,
        
        // Revenue summary
        estimatedJobValue: estimatedJobValue ? Math.round(estimatedJobValue) : null,
        estimatedJobValueRange: contact.estimated_value_min && contact.estimated_value_max
          ? {
              min: Math.round(contact.estimated_value_min),
              max: Math.round(contact.estimated_value_max)
            }
          : null,
        estimatedValueConfidence: contact.estimated_value_confidence,
        
        // Job classification
        jobType: contact.job_type,
        revenueCategory: contact.revenue_category,
        
        // Close probability
        closeProbability: contact.close_probability,
        closeProbabilityBreakdown: closeProbData ? {
          replyInterest: closeProbData.reply_interest_score,
          stormUrgency: closeProbData.storm_urgency_score,
          insuranceActivity: closeProbData.insurance_activity_score,
          homeownerTone: closeProbData.homeowner_tone_score,
          pastInteractions: closeProbData.past_interactions_score,
          bookingBehavior: closeProbData.booking_behavior_score,
          quoteSent: closeProbData.quote_sent_score,
          leadHeat: closeProbData.lead_heat_score
        } : null,
        
        // Insurance claim data
        insuranceClaim: contact.insurance_claim_value_min || contact.insurance_claim_value_max
          ? {
              valueRange: {
                min: contact.insurance_claim_value_min,
                max: contact.insurance_claim_value_max
              },
              deductible: contact.insurance_deductible,
              claimType: contact.insurance_claim_type,
              estimatedRange: contact.insurance_claim_value_min && contact.insurance_claim_value_max
                ? `$${Math.round(contact.insurance_claim_value_min)} - $${Math.round(contact.insurance_claim_value_max)}`
                : null
            }
          : null,
        
        // Storm impact
        stormImpactSeverity: contact.storm_impact_severity,
        
        // Quote data
        quoteAmount: contact.quote_amount,
        lastQuoteAmount: contact.last_quote_amount,
        quoteSentAt: contact.quote_sent_at,
        
        // Property data
        homeValue: contact.home_value,
        roofSizeSqft: contact.roof_size_sqft,
        roofAgeYears: contact.roof_age_years,
        
        // Flags
        highValueFlag: contact.high_value_flag,
        
        // Recommended next step
        recommendedNextStep,
        
        // Timeline
        revenueTimeline
      }
    });
  } catch (error: any) {
    console.error("Revenue contact error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load contact revenue data" },
      { status: 500 }
    );
  }
}





















































