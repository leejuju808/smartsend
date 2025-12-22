import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/campaigns/launch
 * Launch a preset campaign from template
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { template_id } = await req.json();

    if (!template_id) {
      return NextResponse.json(
        { error: "template_id required" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Check if template exists
    const { data: template, error: tmplError } = await supabase
      .from("campaign_templates")
      .select("id, name, goal, key")
      .eq("id", template_id)
      .single();

    if (tmplError || !template) {
      // Try preset templates
      const presetTemplates: Record<string, any> = {
        lead_revival: {
          name: "Lead Revival",
          goal: "book_estimates",
          key: "lead_revival",
        },
        free_inspection: {
          name: "Free Inspection",
          goal: "book_estimates",
          key: "free_inspection",
        },
        storm_outreach: {
          name: "Storm Outreach",
          goal: "book_estimates",
          key: "storm_outreach",
        },
        repair_followup: {
          name: "Repair Follow-Up",
          goal: "book_estimates",
          key: "repair_followup",
        },
        seasonal: {
          name: "Seasonal Templates",
          goal: "book_estimates",
          key: "seasonal",
        },
      };

      const preset = presetTemplates[template_id];
      if (!preset) {
        return NextResponse.json(
          { error: "Template not found" },
          { status: 404 }
        );
      }

      // Use preset template
      const { data: steps } = await supabase
        .from("campaign_template_steps")
        .select("step_order, subject_template, body_template, delay_days")
        .eq("template_id", template_id)
        .order("step_order", { ascending: true });

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          workspace_id,
          name: preset.name,
          status: "running",
          goal: preset.goal,
          template_key: preset.key,
          audience_type: "all_contacts",
        })
        .select()
        .single();

      if (campaignError) {
        return NextResponse.json(
          { error: "Failed to create campaign" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        campaign_id: campaign.id,
        message: "Campaign launched successfully",
      });
    }

    // Use existing template
    const { data: steps } = await supabase
      .from("campaign_template_steps")
      .select("step_order, subject_template, body_template, delay_days")
      .eq("template_id", template_id)
      .order("step_order", { ascending: true });

    // Create campaign from template
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        workspace_id,
        name: template.name,
        status: "running",
        goal: template.goal,
        template_key: template.key,
        audience_type: "all_contacts",
      })
      .select()
      .single();

    if (campaignError) {
      return NextResponse.json(
        { error: "Failed to create campaign" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      campaign_id: campaign.id,
      message: "Campaign launched successfully",
    });
  } catch (error: any) {
    console.error("Error launching campaign:", error);
    return NextResponse.json(
      { error: "Failed to launch campaign" },
      { status: 500 }
    );
  }
}






































