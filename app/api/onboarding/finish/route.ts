// Block 12200 — First-Campaign Onboarding Wizard
// POST /api/onboarding/finish - Mark onboarding as complete and create campaign

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

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
    const { campaignId } = body;

    const orgId = await getCurrentOrgId(supabase, user.id);

    // Mark onboarding as complete
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      return NextResponse.json({ error: "Failed to mark onboarding as complete" }, { status: 500 });
    }

    // Update onboarding state
    const { error: stateError } = await supabase
      .from("onboarding_state")
      .update({
        step: 7,
        completed_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("org_id", orgId);

    if (stateError) {
      console.error("Error updating onboarding state:", stateError);
    }

    return NextResponse.json({
      success: true,
      campaignId: campaignId || null,
    });
  } catch (error: any) {
    console.error("Error in POST /api/onboarding/finish:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}




























































