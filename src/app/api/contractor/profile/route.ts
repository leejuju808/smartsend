import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/contractor/profile
 * Get contractor profile for current workspace
 */
export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace from query param or header
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspace_id") || req.headers.get("x-workspace-id");

  if (!workspaceId) {
    // Fallback: get first workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }
    const wsId = membership.workspace_id;

    // Fetch all contractor profile data
    const [profile, services, territory, scheduleRules, pricing, materials, insurance, quotePrefs, regional] = await Promise.all([
      supabase.from("contractor_profile").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_services").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_territory").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_schedule_rules").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_pricing").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_material_preferences").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_insurance_preferences").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_quote_preferences").select("*").eq("workspace_id", wsId).maybeSingle(),
      supabase.from("contractor_regional_data").select("*").eq("workspace_id", wsId).maybeSingle(),
    ]);

    return NextResponse.json({
      workspace_id: wsId,
      profile: profile.data || null,
      services: services.data || null,
      territory: territory.data || null,
      schedule_rules: scheduleRules.data || null,
      pricing: pricing.data || null,
      materials: materials.data || null,
      insurance: insurance.data || null,
      quote_preferences: quotePrefs.data || null,
      regional_data: regional.data || null,
    });
  }

  // Verify workspace membership
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  // Fetch all contractor profile data
  const [profile, services, territory, scheduleRules, pricing, materials, insurance, quotePrefs, regional] = await Promise.all([
    supabase.from("contractor_profile").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_services").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_territory").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_schedule_rules").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_pricing").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_material_preferences").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_insurance_preferences").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_quote_preferences").select("*").eq("workspace_id", workspaceId).maybeSingle(),
    supabase.from("contractor_regional_data").select("*").eq("workspace_id", workspaceId).maybeSingle(),
  ]);

  return NextResponse.json({
    workspace_id: workspaceId,
    profile: profile.data || null,
    services: services.data || null,
    territory: territory.data || null,
    schedule_rules: scheduleRules.data || null,
    pricing: pricing.data || null,
    materials: materials.data || null,
    insurance: insurance.data || null,
    quote_preferences: quotePrefs.data || null,
    regional_data: regional.data || null,
  });
}

/**
 * POST /api/contractor/profile
 * Update contractor profile (owners/admins only)
 */
export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { workspace_id, ...profileData } = body;

  if (!workspace_id) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  // Verify workspace membership and admin/owner role
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("workspace_id", workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can update contractor profile" }, { status: 403 });
  }

  // Update contractor_profile
  const { data: existing } = await supabase
    .from("contractor_profile")
    .select("id")
    .eq("workspace_id", workspace_id)
    .maybeSingle();

  const payload = {
    workspace_id,
    ...profileData,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    result = await supabase
      .from("contractor_profile")
      .update(payload)
      .eq("workspace_id", workspace_id)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("contractor_profile")
      .insert(payload)
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  return NextResponse.json(result.data);
}





















































