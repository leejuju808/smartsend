/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Launch Marketing Campaign
 * 
 * POST /api/marketing/campaigns/[id]/launch - Launch a campaign and enroll recipients
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { approve = false } = body;

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // If approval required, mark as approved
    if (approve) {
      await supabase
        .from("marketing_campaigns")
        .update({
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          status: "scheduled",
        })
        .eq("id", id);
    }

    // Find recipients based on targeting
    const recipients = await findRecipients(supabase, campaign);

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "No recipients found matching targeting criteria" },
        { status: 400 }
      );
    }

    // Enroll recipients
    const recipientRows = recipients.map((recipient) => ({
      campaign_id: id,
      contact_id: recipient.contact_id || null,
      lead_id: recipient.lead_id || null,
      email: recipient.email,
      first_name: recipient.first_name || null,
      last_name: recipient.last_name || null,
      zip: recipient.zip || null,
      city: recipient.city || null,
      state: recipient.state || null,
      status: "pending",
    }));

    const { error: enrollError } = await supabase
      .from("marketing_campaign_recipients")
      .insert(recipientRows);

    if (enrollError) {
      console.error("Error enrolling recipients:", enrollError);
      return NextResponse.json({ error: "Failed to enroll recipients" }, { status: 500 });
    }

    // Update campaign recipient count
    await supabase
      .from("marketing_campaigns")
      .update({
        total_recipients: recipients.length,
        status: campaign.status === "draft" ? "scheduled" : campaign.status,
      })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      recipients_enrolled: recipients.length,
      campaign_id: id,
    });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/campaigns/[id]/launch:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Find recipients based on campaign targeting configuration
 */
async function findRecipients(supabase: any, campaign: any): Promise<any[]> {
  const { targeting_type, targeting_config, audience_filters, campaign_type } = campaign;
  const recipients: any[] = [];

  // Build query based on targeting type
  let query = supabase
    .from("contacts")
    .select("id, email, first_name, last_name, zip, city, state")
    .eq("workspace_id", campaign.workspace_id);

  // Apply targeting filters
  if (targeting_type === "zip" && targeting_config?.zips?.length > 0) {
    query = query.in("postal_code", targeting_config.zips);
  }

  if (targeting_type === "neighborhood" && targeting_config?.neighborhoods?.length > 0) {
    // Note: This assumes neighborhood is stored in enrichment or tags
    // Adjust based on your actual schema
    query = query.contains("tags", targeting_config.neighborhoods);
  }

  if (targeting_type === "county" && targeting_config?.counties?.length > 0) {
    // Note: County might need to be looked up via ZIP or stored separately
    // This is a placeholder
  }

  // Apply audience filters
  if (audience_filters) {
    // Filter by lead age (for previous estimates campaign)
    if (audience_filters.lead_age_months) {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - audience_filters.lead_age_months);
      // This would require joining with leads table
    }

    // Filter by customer years
    if (audience_filters.customer_years?.length > 0) {
      // This would require joining with jobs/customers table
    }
  }

  // Campaign-specific targeting
  if (campaign_type === "previous_estimates") {
    // Target leads with quotes but no approval
    // This would require joining with leads/quotes table
  }

  if (campaign_type === "customer_database") {
    // Target past customers
    // This would require joining with jobs/customers table
  }

  const { data: contacts, error } = await query;

  if (error) {
    console.error("Error finding recipients:", error);
    return [];
  }

  // Convert contacts to recipient format
  return (contacts || []).map((contact: any) => ({
    contact_id: contact.id,
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    zip: contact.postal_code || contact.zip,
    city: contact.city,
    state: contact.state,
  }));
}




































