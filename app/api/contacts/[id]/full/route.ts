import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * Block 16500 — Contact Profile v2 Full Data Endpoint
 * Returns comprehensive contact data including:
 * - Contact info, enrichment, tags, campaigns
 * - Lead heat score
 * - Insurance metadata
 * - Weather events (storm history)
 * - Revenue stats
 * - Tasks
 * - Files/attachments
 * - Timeline events
 * - AI summary data
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

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const contactId = params.id;

  // 1. Get contact with pipeline stage info
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select(`
      *,
      pipeline_stages:pipeline_stage_id (
        id,
        key,
        label
      )
    `)
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .single();

  if (contactError || !contact) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  // 2. Get enrichment data
  const { data: enrichment } = await supabase
    .from("contact_enrichment")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  // 3. Get lead heat score
  const { data: heatScore } = await supabase
    .from("lead_heat_scores")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  // 4. Get insurance metadata (Block 17400)
  const { data: insuranceMeta } = await supabase
    .from("insurance_metadata")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  // 4b. Get insurance intelligence (Block 19000)
  const { data: insuranceIntelligence } = await supabase
    .from("insurance_intelligence")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  // 4c. Get insurance claims (Block 19000)
  const { data: insuranceClaim } = await supabase
    .from("insurance_claims")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  // 5. Get weather events for this contact's ZIP
  const zip = contact.zip || contact.postal_code;
  let weatherEventsData: any[] = [];
  if (zip) {
    const { data: weatherEvents } = await supabase
      .from("weather_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("zip", zip)
      .order("storm_started_at", { ascending: false })
      .limit(10);
    weatherEventsData = weatherEvents || [];
  }

  // 6. Get tasks for this contact
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("contact_id", contactId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  // 7. Get files/attachments
  const { data: files } = await supabase
    .from("attachments")
    .select("*")
    .eq("linked_to", contactId)
    .order("created_at", { ascending: false });

  // 8. Get tags
  const tags = Array.isArray(contact.tags) 
    ? contact.tags 
    : (typeof contact.tags === 'string' ? JSON.parse(contact.tags || '[]') : []);

  // 9. Get campaigns
  const { data: campaigns } = await supabase
    .from("leads")
    .select(`
      id,
      campaign_id,
      campaigns:campaign_id (
        id,
        name,
        status
      )
    `)
    .eq("workspace_id", workspaceId)
    .ilike("email", contact.email);

  const campaignList = campaigns
    ?.map((l: any) => l.campaigns)
    .filter(Boolean)
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      status: c.status,
    })) || [];

  // 10. Get stats
  const { data: statsData } = await supabase.rpc("get_contact_stats", {
    p_contact_id: contactId,
  });

  const stats = statsData || {
    emails_sent: 0,
    emails_replied: 0,
    last_activity_at: null,
    last_intent: null,
  };

  // 11. Get owner info
  let owner = null;
  const ownerId = (contact as any).owner_user_id || contact.owner_id;
  if (ownerId) {
    const { data: ownerData } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", ownerId)
      .single();
    owner = ownerData;
  }

  // 12. Get recent timeline events (last 20)
  const { data: timelineEvents } = await supabase
    .from("contact_timeline")
    .select("*")
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(20);

  // 13. Get inbox threads/messages for this contact
  const { data: threads } = await supabase
    .from("inbox_threads")
    .select(`
      *,
      messages:inbox_messages (
        *,
        sender:profiles!inbox_messages_sender_id_fkey (
          id,
          email,
          full_name
        )
      )
    `)
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(10);

  // Extract pipeline stage info
  const pipelineStage = contact.pipeline_stages
    ? (Array.isArray(contact.pipeline_stages)
        ? contact.pipeline_stages[0]
        : contact.pipeline_stages)
    : null;

  // Calculate AI summary data
  const aiSummary = {
    intent: stats.last_intent || "UNKNOWN",
    tone: heatScore?.reply_tone_score ? (heatScore.reply_tone_score > 20 ? "Positive" : heatScore.reply_tone_score > 10 ? "Neutral" : "Negative") : "Unknown",
    job_type: (contact as any).job_type || "unknown",
    storm_impact: weatherEventsData && weatherEventsData.length > 0 ? {
      last_storm_date: weatherEventsData[0].storm_started_at,
      storm_type: weatherEventsData[0].storm_type,
      severity: weatherEventsData[0].severity,
      storm_risk_level: contact.storm_risk_level,
      hail_size: weatherEventsData[0].hail_size || null,
    } : null,
    insurance_likelihood: insuranceMeta ? {
      claim_likelihood: insuranceMeta.has_insurance_claim ? "High" : insuranceMeta.storm_related ? "Medium" : "Low",
      adjuster_mentioned: !!insuranceMeta.adjuster_name,
      deductible_noted: false, // Would need to parse from notes
      claim_filed: insuranceMeta.claim_status === "filed" || insuranceMeta.claim_status === "approved",
      acv_rcv_hints: false, // Would need to parse from notes
    } : {
      claim_likelihood: "Low",
      adjuster_mentioned: false,
      deductible_noted: false,
      claim_filed: false,
      acv_rcv_hints: false,
    },
    next_recommended_action: heatScore?.heat_level === "hot" ? "Call immediately" : 
                             heatScore?.heat_level === "warm" ? "Follow up this week" :
                             insuranceMeta?.has_insurance_claim ? "Prepare insurance proposal" :
                             "Continue nurturing",
    heat_score: heatScore?.heat_score || 0,
    close_probability: heatScore ? Math.min(heatScore.heat_score, 95) : 0,
    appointment_status: contact.next_appointment_at ? "Scheduled" : contact.last_appointment_at ? "Past" : "None",
    revenue_estimate: contact.estimated_job_value || (contact as any).estimated_value_min || null,
  };

  return NextResponse.json({
    contact: {
      id: contact.id,
      email: contact.email,
      first_name: contact.first_name,
      last_name: contact.last_name,
      company: contact.company,
      title: contact.title,
      phone: contact.phone,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip: contact.zip,
      postal_code: contact.postal_code,
      timezone: contact.timezone,
      county: contact.county,
      homeowner_likelihood: contact.homeowner_likelihood,
      property_type_guess: contact.property_type_guess,
      roof_type_guess: contact.roof_type_guess,
      storm_risk_level: contact.storm_risk_level,
      enriched_at: contact.enriched_at,
      status: contact.status || "New",
      owner_id: contact.owner_id,
      owner_user_id: (contact as any).owner_user_id || contact.owner_id,
      estimated_job_value: contact.estimated_job_value,
      estimated_value_min: (contact as any).estimated_value_min,
      estimated_value_max: (contact as any).estimated_value_max,
      job_type: (contact as any).job_type,
      pipeline_stage_id: contact.pipeline_stage_id,
      pipeline_stage: pipelineStage
        ? { id: pipelineStage.id, key: pipelineStage.key, label: pipelineStage.label }
        : null,
      next_appointment_at: (contact as any).next_appointment_at,
      last_appointment_at: (contact as any).last_appointment_at,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    },
    enrichment: enrichment ? {
      inferred_city: enrichment.inferred_city,
      city_confidence: enrichment.city_confidence,
      inferred_zip: enrichment.inferred_zip,
      zip_confidence: enrichment.zip_confidence,
      inferred_neighborhood: enrichment.inferred_neighborhood,
      neighborhood_confidence: enrichment.neighborhood_confidence,
      property_type: enrichment.property_type,
      property_type_confidence: enrichment.property_type_confidence,
      insurance_interest: enrichment.insurance_interest,
      last_enriched_at: enrichment.last_enriched_at,
    } : null,
    heatScore: heatScore || null,
    insuranceMetadata: insuranceMeta || null,
    insuranceIntelligence: insuranceIntelligence || null, // Block 19000
    insuranceClaim: insuranceClaim || null, // Block 19000
    weatherEvents: weatherEventsData,
    tasks: tasks || [],
    files: files || [],
    tags,
    campaigns: campaignList,
    stats,
    owner,
    timelineEvents: timelineEvents || [],
    threads: threads || [],
    aiSummary,
  });
}

