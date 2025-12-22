// Block 11000 — Step 1: Company Basics API
// POST /api/onboarding/step-1-company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { companyName, ownerName, city, state, serviceFocus } = body;

    if (!companyName || !ownerName || !city || !state) {
      return NextResponse.json(
        { error: "Missing required fields: companyName, ownerName, city, state" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const workspaceId = membership?.workspace_id;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found for user" },
        { status: 400 }
      );
    }

    // Upsert account profile (from Block 9200)
    const { data: profile, error: profileError } = await supabase
      .from("account_profiles")
      .upsert(
        {
          workspace_id: workspaceId,
          company_name: companyName,
          owner_name: ownerName,
          service_area: `${city}, ${state}`,
          services: serviceFocus || ["roof_repair", "roof_inspection"], // Default to repairs + inspections
        },
        {
          onConflict: "workspace_id",
        }
      )
      .select()
      .single();

    if (profileError) {
      console.error("Error saving account profile:", profileError);
      return NextResponse.json(
        { error: "Failed to save company profile" },
        { status: 500 }
      );
    }

    // Update onboarding status
    const { error: statusError } = await supabase.rpc("get_or_create_onboarding_status", {
      p_user_id: user.id,
    });

    if (statusError) {
      console.error("Error getting onboarding status:", statusError);
    }

    const { error: updateError } = await supabase
      .from("onboarding_status")
      .update({ step_1_done: true })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating onboarding status:", updateError);
    }

    return NextResponse.json(
      {
        success: true,
        profile,
        message: "Company profile saved successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in step-1-company:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}























































