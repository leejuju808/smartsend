// Block 12200 — First-Campaign Onboarding Wizard
// POST /api/onboarding/launch-campaign - Create and launch campaign from onboarding

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { logActivity } from "@/lib/activity";

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membership?.workspace_id) {
    const supabaseAdmin = createSupabaseServer();
    const { data: workspace } = await supabaseAdmin
      .from("workspaces")
      .select("org_id")
      .eq("id", membership.workspace_id)
      .single();

    if (workspace?.org_id) {
      return workspace.org_id;
    }
  }

  const { data: orgMember } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return orgMember?.org_id || null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      campaignName,
      templateId,
      sendingIdentityId,
      contactIds,
      personalizationData,
      schedule,
      dailySendCap,
      sendingWindowStart,
      sendingWindowEnd,
    } = body;

    // Get workspace and org
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const workspaceId = membership.workspace_id;
    const orgId = await getCurrentOrgId(supabase, user.id);

    // Get template
    const { data: template, error: templateError } = await supabase
      .from("templates_campaigns")
      .select("*")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Replace variables in template steps
    const steps = (template.steps as any[]).map((step: any) => {
      let subject = step.subject || "";
      let body = step.body || "";

      // Replace variables
      Object.keys(personalizationData || {}).forEach((key) => {
        const value = personalizationData[key] || "";
        subject = subject.replace(new RegExp(`{{${key}}}`, "g"), value);
        body = body.replace(new RegExp(`{{${key}}}`, "g"), value);
      });

      return {
        step: step.stepNumber || 1,
        subject,
        body,
        delayDays: step.delayDays || 0,
      };
    });

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .insert({
        name: campaignName || "My First Campaign",
        status: schedule?.immediate ? "scheduled" : "draft",
        workspace_id: workspaceId,
        org_id: orgId,
        from_email_account_id: sendingIdentityId, // This might need adjustment based on your schema
        sending_identity_id: sendingIdentityId,
        audience_type: "manual",
        sequence: steps,
        start_date: schedule?.immediate ? new Date().toISOString() : schedule?.startDate,
        daily_send_cap: dailySendCap || null,
        sending_window_start: sendingWindowStart || null,
        sending_window_end: sendingWindowEnd || null,
        created_by: user.id,
        is_shared: false,
      })
      .select("id")
      .single();

    if (campaignError || !campaign) {
      console.error("Error creating campaign:", campaignError);
      return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
    }

    // Tag contacts with onboarding_campaign tag
    if (contactIds && contactIds.length > 0) {
      // Add tag to contacts (assuming you have a contact_tags table or similar)
      // This is a placeholder - adjust based on your contact tagging system
      await supabase
        .from("contacts")
        .update({ tags: supabase.rpc("array_append", { arr: ["onboarding_campaign"], elem: null }) })
        .in("id", contactIds);
    }

    // Log activity
    await logActivity({
      workspaceId,
      actorId: user.id,
      eventType: "campaign_created",
      description: `Campaign "${campaignName || "My First Campaign"}" created from onboarding`,
      campaignId: campaign.id,
      metadata: { from_onboarding: true },
    }).catch((err) => {
      console.error("Failed to log activity:", err);
    });

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      next: `/campaigns/${campaign.id}`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/onboarding/launch-campaign:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




























































