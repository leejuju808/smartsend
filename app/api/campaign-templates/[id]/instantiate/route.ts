import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/campaign-templates/[id]/instantiate
 * Create a campaign from a template
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const templateId = params.id;
    const body = await req.json();
    const { workspaceId, personaId, enableLocalPersonalization } = body;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("current_org_id")
      .eq("id", user.id)
      .single();

    const orgId = profile?.current_org_id;

    // Fetch template
    const { data: template, error: templateError } = await supabase
      .from("campaign_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    // Fetch template steps
    const { data: steps, error: stepsError } = await supabase
      .from("campaign_template_steps")
      .select("*")
      .eq("template_id", templateId)
      .order("step_order");

    if (stepsError) {
      return NextResponse.json(
        { error: "Failed to fetch template steps" },
        { status: 500 }
      );
    }

    // Get email account for workspace
    const { data: emailAccount } = await supabase
      .from("email_accounts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_primary", true)
      .maybeSingle();

    if (!emailAccount) {
      return NextResponse.json(
        { error: "No email account configured" },
        { status: 400 }
      );
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        org_id: orgId,
        name: template.name,
        status: "draft",
        from_email_account_id: emailAccount.id,
        sending_identity_id: emailAccount.id,
        audience_type: "manual",
        created_by: user.id,
      })
      .select()
      .single();

    if (campaignError || !campaign) {
      console.error("Campaign creation error:", campaignError);
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    // Create campaign steps from template steps
    // If persona is selected, we'll rewrite the steps
    const stepsToInsert = steps?.map((step, index) => {
      let subject = step.subject_template;
      let body = step.body_template;

      // TODO: Apply persona rewrite if personaId is provided
      // TODO: Apply local personalization if enableLocalPersonalization is true

      return {
        campaign_id: campaign.id,
        step_no: step.step_order,
        subject_template: subject,
        body_template: body,
        delay_days: step.delay_days,
        active: true,
      };
    }) || [];

    if (stepsToInsert.length > 0) {
      const { error: stepsInsertError } = await supabase
        .from("campaign_steps")
        .insert(stepsToInsert);

      if (stepsInsertError) {
        console.error("Steps insertion error:", stepsInsertError);
        // Continue anyway - campaign is created
      }
    }

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      stepsCreated: stepsToInsert.length,
    });
  } catch (error: any) {
    console.error("Instantiate template error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























