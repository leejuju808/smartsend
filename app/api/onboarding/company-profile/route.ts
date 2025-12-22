// app/api/onboarding/company-profile/route.ts
// Block 9200 — Onboarding Flow v1: Step 1 — Company Profile
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Get user's workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "No workspace found" },
      { status: 400 }
    );
  }

  const workspaceId = membership.workspace_id;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    company_name,
    owner_name,
    service_area,
    services,
    average_job_value,
  } = body;

  // Validate required fields
  if (!company_name || !owner_name || !service_area) {
    return NextResponse.json(
      { error: "Missing required fields: company_name, owner_name, service_area" },
      { status: 400 }
    );
  }

  // Upsert account profile
  const { data: profile, error: profileError } = await supabase
    .from("account_profiles")
    .upsert(
      {
        workspace_id: workspaceId,
        company_name,
        owner_name,
        service_area,
        services: services || [],
        average_job_value: average_job_value ? parseFloat(average_job_value) : null,
      },
      {
        onConflict: "workspace_id",
      }
    )
    .select()
    .single();

  if (profileError) {
    console.error("Error saving profile:", profileError);
    return NextResponse.json(
      { error: "Failed to save company profile" },
      { status: 500 }
    );
  }

  // Update workspace onboarding step
  const { error: stepError } = await supabase
    .from("workspaces")
    .update({ onboarding_step: "sending_identity" })
    .eq("id", workspaceId);

  if (stepError) {
    console.error("Error updating onboarding step:", stepError);
    // Don't fail the request, just log
  }

  return NextResponse.json(
    { success: true, profile },
    { status: 200 }
  );
}
























































