import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Grab default workspace (get first workspace they belong to)
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  const { data: profile } = await supabase
    .from("workspace_profile")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  return NextResponse.json({
    workspace_id: workspaceId,
    profile: profile || null,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    company_name,
    primary_city,
    service_area,
    typical_job_types,
    avg_job_value,
    tone_style,
  } = body;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  const { data: existing } = await supabase
    .from("workspace_profile")
    .select("id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const payload = {
    workspace_id: workspaceId,
    company_name,
    primary_city,
    service_area,
    typical_job_types,
    avg_job_value,
    tone_style: tone_style || "direct",
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    result = await supabase
      .from("workspace_profile")
      .update(payload)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("workspace_profile")
      .insert(payload)
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  // Block 15600: Auto-mark profile_done if profile is complete
  // Profile is complete if: company_name, primary_city, and at least one core_service exist
  const profile = result.data;
  const hasCompanyName = !!profile.company_name;
  const hasPrimaryCity = !!profile.primary_city;
  // Check for core_services array (if exists) or typical_job_types as fallback
  const hasCoreService = 
    (Array.isArray(profile.core_services) && profile.core_services.length > 0) ||
    !!profile.typical_job_types;

  if (hasCompanyName && hasPrimaryCity && hasCoreService) {
    // Get current onboarding state
    const { data: currentWorkspace } = await supabase
      .from("workspaces")
      .select("onboarding_state")
      .eq("id", workspaceId)
      .single();

    const currentState = currentWorkspace?.onboarding_state || {
      profile_done: false,
      contacts_done: false,
      first_campaign_done: false,
    };

    const newState = {
      ...currentState,
      profile_done: true,
    };

    const allDone =
      newState.profile_done &&
      newState.contacts_done &&
      newState.first_campaign_done;

    // Update onboarding state
    await supabase
      .from("workspaces")
      .update({
        onboarding_state: newState,
        onboarding_completed_at: allDone ? new Date().toISOString() : null,
      })
      .eq("id", workspaceId);
  }

  return NextResponse.json(result.data);
}

