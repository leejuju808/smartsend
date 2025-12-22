// app/api/campaigns/[id]/review/route.ts
// Block 15700 — Campaign Review & Send Flow v1
// Block 263 — Campaign Review Center v1 (legacy support)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRoofingOpener } from "@/lib/ai/generateRoofingOpener";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  // Verify authentication
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaignId = params.id;

  // Load campaign
  const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
    .select("id, name, template_key, workspace_id, scheduled_for, status")
      .eq("id", campaignId)
      .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Load campaign steps separately
  const { data: stepsData, error: stepsError } = await supabase
    .from("campaign_steps")
    .select(
      `
      id,
      step_no,
      step_order,
      step_number,
      step_index,
      subject_template,
      body_template,
      body_html_template,
      delay_days,
      offset_days,
      ab_test_enabled,
      subject_variant_a,
      subject_variant_b
      `
    )
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true })
    .order("step_order", { ascending: true })
    .order("step_number", { ascending: true })
    .order("step_index", { ascending: true });

  // Attach steps to campaign object for consistency
  (campaign as any).campaign_steps = stepsData || [];

  // Get workspace profile for personalization
  let workspaceProfile: any = {};
  if (campaign.workspace_id) {
    const { data: profile } = await supabase
      .from("workspace_profile")
      .select("*")
      .eq("workspace_id", campaign.workspace_id)
      .maybeSingle();
    
    workspaceProfile = profile || {};
  }

  // Count contacts from campaign_audience
  const { data: audience, error: audienceError } = await supabase
    .from("campaign_audience")
    .select("contact_id, lead_id")
    .eq("campaign_id", campaignId);

  // Also check campaign_contacts table
  const { data: contactsData } = await supabase
    .from("campaign_contacts")
    .select("contact_id")
    .eq("campaign_id", campaignId);

  // Combine contact IDs from both sources
  const contactIds = [
    ...(audience?.map((r) => r.contact_id || r.lead_id).filter(Boolean) || []),
    ...(contactsData?.map((r) => r.contact_id).filter(Boolean) || []),
  ];
  
  // Remove duplicates
  const uniqueContactIds = [...new Set(contactIds)];
  // Also support legacy/simple imports via campaign_leads (CSV upload flow).
  const { count: campaignLeadsCount } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  const contactCount =
    uniqueContactIds.length > 0
      ? uniqueContactIds.length
      : campaignLeadsCount || 0;

  // Pick 3 random contacts for preview
  const previewIds = uniqueContactIds
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  // Normalize steps - handle different column name variations
  const steps = (((campaign as any).campaign_steps || []) as any[]).map((step: any) => ({
    id: step.id,
    step_order: step.step_order ?? step.step_no ?? step.step_number ?? step.step_index ?? 1,
    subject_template: step.subject_template || "",
    body_template: step.body_template || step.body_html_template || "",
    delay_days: step.delay_days ?? step.offset_days ?? 0,
    ab_test_enabled: step.ab_test_enabled || false,
    subject_variant_a: step.subject_variant_a || null,
    subject_variant_b: step.subject_variant_b || null,
  })).sort((a: any, b: any) => a.step_order - b.step_order);

  let previews: any[] = [];

  // Generate previews for each step
  for (const step of steps) {
    const contactPreviewList: any[] = [];

    for (const contactId of previewIds) {
      try {
        // Try contacts table first
        let contact: any = null;
        const { data: contactData } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .maybeSingle();

        if (!contactData) {
          // Try leads table as fallback
          const { data: leadData } = await supabase
            .from("leads")
            .select("*")
            .eq("id", contactId)
            .maybeSingle();
          contact = leadData;
        } else {
          contact = contactData;
        }

        if (!contact) continue;

        // Generate personalized opener
        let opener = "";
        try {
          opener = await generateRoofingOpener({
            workspaceProfile: {
              company_name: workspaceProfile.company_name,
              primary_city: workspaceProfile.primary_city,
              service_areas: workspaceProfile.service_areas || workspaceProfile.service_area?.split(",").map((s: string) => s.trim()) || [],
              years_in_business: workspaceProfile.years_in_business,
              core_services: workspaceProfile.core_services || workspaceProfile.typical_job_types?.split(",").map((s: string) => s.trim()) || [],
              brand_tone: (workspaceProfile.brand_tone || workspaceProfile.tone_style || "friendly") as any,
            },
            contact: {
              first_name: contact.first_name,
              last_name: contact.last_name,
              city: contact.city,
              lead_source: contact.lead_source || contact.last_source || "unknown",
              source_meta: contact.source_meta,
            },
            campaign: {
              name: campaign.name,
              template_key: campaign.template_key,
            },
            step: {
              subject: step.subject_template,
            },
          });
        } catch (openerError) {
          console.error("Failed to generate opener:", openerError);
          opener = "Hi there,"; // Fallback
        }

        // Replace {{opener}} placeholder in body template
        const body = step.body_template.replace(/\{\{opener\}\}/g, opener);

        contactPreviewList.push({
          contact: {
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            city: contact.city,
          },
          subject: step.subject_template,
          body: body,
        });
      } catch (error) {
        console.error("Error generating preview for contact:", contactId, error);
        // Continue with next contact
      }
    }

    previews.push({
      step_id: step.id,
      step_order: step.step_order,
      previews: contactPreviewList,
    });
  }

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      template_key: campaign.template_key,
      workspace_id: campaign.workspace_id,
      scheduled_for: campaign.scheduled_for,
      status: campaign.status,
      steps: steps,
    },
    contactCount,
    previews,
  });
}

