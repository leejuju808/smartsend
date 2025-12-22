// Block 239000 — SmartSend Roofing Marketing Hub v1
// POST /api/marketing/create - Create a new marketing campaign

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      company_id,
      name,
      type,
      trigger_type,
      trigger_config = {},
      steps = [],
    } = body;

    // Validation
    if (!workspace_id || !name || !type || !trigger_type) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, name, type, trigger_type" },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['review', 'referral', 'upsell', 'reactivation', 'nurture', 'warranty', 'anniversary', 'storm_followup'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate trigger_type
    const validTriggerTypes = ['job_completed', 'lead_status_changed', 'time_delay', 'manual', 'lead_inactive', 'warranty_expiring', 'anniversary', 'weather_event'];
    if (!validTriggerTypes.includes(trigger_type)) {
      return NextResponse.json(
        { error: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspaceMember) {
      return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("marketing_campaigns")
      .insert({
        workspace_id,
        company_id: company_id || null,
        name,
        type,
        trigger_type,
        trigger_config,
        status: 'active',
        is_template: false,
        is_ai_generated: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (campaignError) {
      console.error("[Marketing Hub] Create campaign error:", campaignError);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    // Create steps if provided
    if (steps && steps.length > 0) {
      const stepInserts = steps.map((step: any, index: number) => ({
        campaign_id: campaign.id,
        step_order: step.step_order !== undefined ? step.step_order : index + 1,
        delay_hours: step.delay_hours || 0,
        channel: step.channel,
        subject: step.subject || null,
        content: step.content,
        personalization_tokens: step.personalization_tokens || {},
        require_response: step.require_response || false,
        skip_if_condition: step.skip_if_condition || {},
      }));

      const { error: stepsError } = await supabase
        .from("marketing_steps")
        .insert(stepInserts);

      if (stepsError) {
        console.error("[Marketing Hub] Create steps error:", stepsError);
        // Rollback campaign creation
        await supabase.from("marketing_campaigns").delete().eq("id", campaign.id);
        return NextResponse.json(
          { error: "Failed to create campaign steps" },
          { status: 500 }
        );
      }
    }

    // Fetch complete campaign with steps
    const { data: completeCampaign, error: fetchError } = await supabase
      .from("marketing_campaigns")
      .select(`
        *,
        marketing_steps (
          id,
          step_order,
          delay_hours,
          channel,
          subject,
          content,
          personalization_tokens,
          require_response,
          skip_if_condition
        )
      `)
      .eq("id", campaign.id)
      .single();

    if (fetchError) {
      console.error("[Marketing Hub] Fetch error:", fetchError);
    }

    return NextResponse.json(
      { campaign: completeCampaign || campaign },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[Marketing Hub] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























