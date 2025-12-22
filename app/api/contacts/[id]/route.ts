import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

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

  // Get contact with pipeline stage info
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
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .single();

  // Block 13400: Get enrichment data
  const { data: enrichment } = await supabase
    .from("contact_enrichment")
    .select("*")
    .eq("contact_id", params.id)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  // Get tags (from jsonb column or array)
  const tags = Array.isArray(contact.tags) 
    ? contact.tags 
    : (typeof contact.tags === 'string' ? JSON.parse(contact.tags || '[]') : []);

  // Get campaigns this contact is in (via leads -> campaign_leads)
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

  // Get stats using the helper function
  const { data: statsData } = await supabase.rpc("get_contact_stats", {
    p_contact_id: params.id,
  });

  const stats = statsData || {
    emails_sent: 0,
    emails_replied: 0,
    last_activity_at: null,
    last_intent: null,
  };

  // Block 16300: Get owner info if assigned (check both owner_id and owner_user_id for backward compatibility)
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

  // Extract pipeline stage info
  const pipelineStage = contact.pipeline_stages
    ? (Array.isArray(contact.pipeline_stages)
        ? contact.pipeline_stages[0]
        : contact.pipeline_stages)
    : null;

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
      // Enrichment fields (Block 12400)
      county: contact.county,
      homeowner_likelihood: contact.homeowner_likelihood,
      property_type_guess: contact.property_type_guess,
      roof_type_guess: contact.roof_type_guess,
      storm_risk_level: contact.storm_risk_level,
      enriched_at: contact.enriched_at,
      // Block 13400: Contact enrichment data
      enrichment: enrichment ? {
        inferred_city: enrichment.inferred_city,
        city_confidence: enrichment.city_confidence,
        inferred_zip: enrichment.inferred_zip,
        zip_confidence: enrichment.zip_confidence,
        inferred_neighborhood: enrichment.inferred_neighborhood,
        neighborhood_confidence: enrichment.neighborhood_confidence,
        inferred_first_name: enrichment.inferred_first_name,
        inferred_last_name: enrichment.inferred_last_name,
        name_confidence: enrichment.name_confidence,
        property_type: enrichment.property_type,
        property_type_confidence: enrichment.property_type_confidence,
        insurance_interest: enrichment.insurance_interest,
        storm_risk_level: enrichment.storm_risk_level,
        last_enriched_at: enrichment.last_enriched_at,
        enrichment_sources: enrichment.enrichment_sources,
      } : null,
      status: contact.status || "New",
      owner_id: contact.owner_id,
      owner_user_id: (contact as any).owner_user_id || contact.owner_id, // Block 16300: Include owner_user_id
      estimated_job_value: contact.estimated_job_value,
      pipeline_stage_id: contact.pipeline_stage_id,
      pipeline_stage: pipelineStage
        ? { id: pipelineStage.id, key: pipelineStage.key, label: pipelineStage.label }
        : null,
      created_at: contact.created_at,
      updated_at: contact.updated_at,
    },
    tags,
    campaigns: campaignList,
    stats,
    owner,
  });
}

export async function PATCH(
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

  const body = await req.json().catch(() => ({}));
  const { status, owner_id, first_name, last_name, phone, address, city, state, zip, timezone, estimated_job_value } = body;

  // Build update object
  const updates: Record<string, any> = {};
  if (status !== undefined) updates.status = status;
  if (owner_id !== undefined) updates.owner_id = owner_id;
  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (phone !== undefined) updates.phone = phone;
  if (address !== undefined) updates.address = address;
  if (city !== undefined) updates.city = city;
  if (state !== undefined) updates.state = state;
  if (zip !== undefined) updates.zip = zip;
  if (timezone !== undefined) updates.timezone = timezone;
  if (estimated_job_value !== undefined) updates.estimated_job_value = estimated_job_value;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", params.id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ contact: data });
}


