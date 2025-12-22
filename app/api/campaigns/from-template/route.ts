import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceAndPlan } from "@/lib/getWorkspacePlan";

export async function POST(req: Request) {
  const supabase = createClient();
  const { workspaceId } = await getWorkspaceAndPlan();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    templateId,
    campaignName,
    audienceType,
    audienceListIds,
  }: {
    templateId: string;
    campaignName?: string;
    audienceType?: "all_contacts" | "lists";
    audienceListIds?: string[];
  } = body;

  if (!templateId) {
    return NextResponse.json(
      { error: "templateId required" },
      { status: 400 }
    );
  }

  const { data: template, error: tmplError } = await supabase
    .from("campaign_templates")
    .select("id, name, goal, key")
    .eq("id", templateId)
    .single();

  if (tmplError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Resolve an outbound mailbox/account for this workspace (required by sender).
  const { data: account } = await supabase
    .from("connected_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!account?.id) {
    return NextResponse.json(
      { error: "No connected email account found for this workspace" },
      { status: 400 }
    );
  }

  // Prefer locked-copy steps if present (template_steps), otherwise fall back to campaign_template_steps.
  const { data: lockedSteps, error: lockedErr } = await supabase
    .from("template_steps")
    .select("step_number, delay_days, subject, body_text")
    .eq("template_id", templateId)
    .order("step_number", { ascending: true });

  let steps: Array<{
    step_no: number;
    delay_days: number; // relative (days after previous step)
    subject_template: string;
    body_template: string;
  }> = [];

  if (!lockedErr && lockedSteps && lockedSteps.length > 0) {
    // template_steps.delay_days is absolute from Day 0 → convert to per-step offsets.
    let prevAbs = 0;
    steps = lockedSteps.map((s: any) => {
      const abs = Number(s.delay_days ?? 0);
      const offset = Math.max(0, abs - prevAbs);
      prevAbs = abs;
      return {
        step_no: Number(s.step_number),
        delay_days: offset,
        subject_template: String(s.subject ?? ""),
        body_template: String(s.body_text ?? ""),
      };
    });
  } else {
    const { data: fallbackSteps, error: stepsError } = await supabase
      .from("campaign_template_steps")
      .select("step_order, subject_template, body_template, delay_days")
      .eq("template_id", templateId)
      .order("step_order", { ascending: true });

    if (stepsError) {
      return NextResponse.json({ error: stepsError.message }, { status: 400 });
    }

    steps =
      (fallbackSteps || []).map((s: any) => ({
        step_no: Number(s.step_order),
        delay_days: Number(s.delay_days ?? 0),
        subject_template: String(s.subject_template ?? ""),
        body_template: String(s.body_template ?? ""),
      })) || [];
  }

  // 1) Create campaign in draft
  // Note: campaigns table may not have 'goal' column, use 'objective' if goal doesn't exist
  const campaignData: any = {
    workspace_id: workspaceId,
    user_id: user.id,
    name: (campaignName || template.name) as string,
    status: "draft",
    audience_type: audienceType || "lists",
    account_id: account.id,
    send_start: "08:00",
    send_end: "17:00",
  };

  // Add goal if column exists, otherwise use objective
  if (template.goal) {
    campaignData.goal = template.goal;
    campaignData.objective = template.goal; // Also set objective as fallback
  }

  // Store template key for lead source auto-tagging (Block 15300)
  if (template.key) {
    campaignData.template_key = template.key;
  }

  if (audienceListIds && audienceListIds.length > 0) {
    campaignData.audience_list_ids = audienceListIds;
  }

  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .insert(campaignData)
    .select("id, name")
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: campError?.message }, { status: 400 });
  }

  // 2) Insert campaign steps
  // campaign_steps uses step_no
  const stepRows = steps.map((s: any) => ({
    campaign_id: campaign.id,
    step_no: s.step_no,
    delay_days: s.delay_days,
    subject_template: s.subject_template,
    body_template: s.body_template,
  }));

  const { error: stepInsertError } = await supabase
    .from("campaign_steps")
    .insert(stepRows);

  if (stepInsertError) {
    return NextResponse.json(
      { error: stepInsertError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    campaign_id: campaign.id,
    message: "Campaign created from template",
  });
}

