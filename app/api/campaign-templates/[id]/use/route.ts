// POST /api/campaign-templates/:id/use
// Creates a new user campaign from a template

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const templateId = params.id;
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1) Load template
  const { data: template, error: templateError } = await supabase
    .from("campaign_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();

  if (templateError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // 2) Convert template emails format to campaign sequence format
  // Template format: [{ step, delay_days, subject, body }]
  // Campaign sequence format: [{ step, subject, body, delayDays }]
  const sequence = Array.isArray(template.emails)
    ? template.emails.map((email: any) => ({
        step: email.step || 1,
        subject: email.subject || "",
        body: email.body || "",
        delayDays: email.delay_days || 0,
      }))
    : [];

  // 3) Get user's workspace_id if available (for workspace-based campaigns)
  // Otherwise fall back to user_id
  let workspaceId: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", user.id)
    .maybeSingle();

  // Try to get workspace_id from workspace_members
  const { data: workspaceMember } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (workspaceMember) {
    workspaceId = workspaceMember.workspace_id;
  }

  // 4) Create campaign record
  const campaignData: any = {
    name: template.name,
    goal: template.goal,
    niche: template.niche,
    sequence: sequence,
    status: "draft",
  };

  // Use workspace_id if available, otherwise use user_id
  if (workspaceId) {
    campaignData.workspace_id = workspaceId;
  } else {
    campaignData.user_id = user.id;
  }

  // Add org_id if available
  if (profile?.current_org_id) {
    campaignData.org_id = profile.current_org_id;
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert(campaignData)
    .select("id")
    .single();

  if (campaignError) {
    console.error("Create campaign from template error:", campaignError);
    return NextResponse.json({ error: "Create failed" }, { status: 400 });
  }

  return NextResponse.json({ status: "ok", campaign_id: campaign.id });
}














































