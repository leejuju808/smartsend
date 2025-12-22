import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceAndPlan } from "@/lib/getWorkspacePlan";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const templateId = params.id;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  let workspaceId: string;
  try {
    const workspace = await getWorkspaceAndPlan();
    workspaceId = workspace.workspaceId;
  } catch (error) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  // Get template
  const { data: template, error: tplError } = await supabase
    .from("campaign_templates")
    .select("id, name, key, goal, description")
    .eq("id", templateId)
    .single();

  if (tplError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Get template steps
  const { data: steps, error: stepsError } = await supabase
    .from("campaign_template_steps")
    .select("*")
    .eq("template_id", template.id)
    .order("step_order", { ascending: true });

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 400 });
  }

  // Create campaign
  const campaignData: any = {
    workspace_id: workspaceId,
    name: template.name,
    template_key: template.key,
    status: "draft",
  };

  // Add goal if column exists
  if (template.goal) {
    campaignData.goal = template.goal;
    campaignData.objective = template.goal; // Also set objective as fallback
  }

  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .insert(campaignData)
    .select("id")
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: campError?.message }, { status: 400 });
  }

  // Clone steps
  // Map step_order (0,1,2...) to step_no (1,2,3...)
  const mappedSteps =
    steps?.map((s: any) => ({
      campaign_id: campaign.id,
      step_no: s.step_order + 1, // Convert 0-based to 1-based
      subject_template: s.subject_template,
      body_template: s.body_template,
      delay_days: s.delay_days,
    })) || [];

  if (mappedSteps.length > 0) {
    const { error: stepInsertError } = await supabase
      .from("campaign_steps")
      .insert(mappedSteps);

    if (stepInsertError) {
      return NextResponse.json(
        { error: stepInsertError.message },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ campaign_id: campaign.id });
}

