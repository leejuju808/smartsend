import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
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
    .from("roofing_templates")
    .select("id, name, description, recommended_for")
    .eq("id", templateId)
    .single();

  if (tplError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Get template steps
  const { data: steps, error: stepsError } = await supabase
    .from("roofing_template_steps")
    .select("*")
    .eq("template_id", template.id)
    .order("step_order", { ascending: true });

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 400 });
  }

  if (!steps || steps.length === 0) {
    return NextResponse.json(
      { error: "Template has no steps" },
      { status: 400 }
    );
  }

  // Convert roofing template steps to campaign sequence format
  const sequence = steps.map((step: any) => ({
    step: step.step_order,
    subject: step.subject,
    body: step.body,
    delayDays: step.delay_days,
  }));

  // Create campaign with sequence
  const campaignData: any = {
    workspace_id: workspaceId,
    name: template.name,
    status: "draft",
    objective: template.description || null,
    sequence: sequence,
    created_by: user.id,
  };

  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .insert(campaignData)
    .select("id")
    .single();

  if (campError || !campaign) {
    console.error("Error creating campaign:", campError);
    return NextResponse.json(
      { error: campError?.message || "Failed to create campaign" },
      { status: 400 }
    );
  }

  // Add creator as campaign member with owner role
  await supabase.from("campaign_members").insert({
    campaign_id: campaign.id,
    user_id: user.id,
    role: "owner",
  });

  return NextResponse.json({
    campaign_id: campaign.id,
    next: `/campaigns/${campaign.id}/review`,
  });
}

