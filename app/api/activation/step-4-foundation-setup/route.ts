import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/step-4-foundation-setup
 * 
 * Step 4: Foundation Setup (Done For Them)
 * Ask only 4 questions:
 * 1. What's the main city you serve?
 * 2. Company phone number?
 * 3. Estimate type: repair, replace, both?
 * 4. Do you already have an email list?
 * 
 * You enter it for them.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      primary_city,
      company_phone,
      estimate_type, // 'repair' | 'replace' | 'both'
      has_email_list, // boolean
    } = body;

    if (!workspace_id || !primary_city || !company_phone || !estimate_type) {
      return NextResponse.json(
        { error: "Missing required fields: workspace_id, primary_city, company_phone, estimate_type" },
        { status: 400 }
      );
    }

    if (!["repair", "replace", "both"].includes(estimate_type)) {
      return NextResponse.json(
        { error: "Invalid estimate_type. Must be repair, replace, or both" },
        { status: 400 }
      );
    }

    // Get activation state
    const { data: activationState, error: activationError } = await supabase
      .from("roofer_activation_state")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (activationError || !activationState) {
      return NextResponse.json(
        { error: "Activation state not found. Complete steps 1-3 first." },
        { status: 404 }
      );
    }

    // Update workspace profile
    const { data: workspaceProfile } = await supabase
      .from("workspace_profiles")
      .select("id")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (workspaceProfile) {
      await supabase
        .from("workspace_profiles")
        .update({
          primary_city,
          company_phone,
        })
        .eq("id", workspaceProfile.id);
    } else {
      await supabase.from("workspace_profiles").insert({
        workspace_id,
        primary_city,
        company_phone,
        niche: "roofing",
      });
    }

    // Update activation state
    const { error: step4Error } = await supabase
      .from("roofer_activation_state")
      .update({
        foundation_setup_at: new Date().toISOString(),
        primary_city,
        company_phone,
        estimate_type,
        has_email_list: has_email_list || false,
        step_completed: 4,
      })
      .eq("id", activationState.id);

    if (step4Error) {
      return NextResponse.json(
        { error: "Failed to update step 4" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      step_completed: 4,
      foundation_setup: {
        primary_city,
        company_phone,
        estimate_type,
        has_email_list: has_email_list || false,
      },
      message: "Foundation setup complete. Roofers hate setup. Doing this for them removes 90% of friction.",
    });
  } catch (error: any) {
    console.error("Error in step-4-foundation-setup:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































