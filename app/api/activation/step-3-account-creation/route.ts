import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/step-3-account-creation
 * 
 * Step 3: Auto-generate account setup
 * - Company name
 * - Owner name
 * - Default timezone
 * - Email sending domain
 * - "Roofing" niche profile
 * - Recommended campaign templates
 * 
 * This is done automatically after subscription activation.
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
      company_name, // Optional, will auto-generate if not provided
      owner_name, // Optional, will use user's name if not provided
      default_timezone = "America/Los_Angeles",
    } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Missing required field: workspace_id" },
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
        { error: "Activation state not found. Complete steps 1-2 first." },
        { status: 404 }
      );
    }

    // Get user profile for auto-generation
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    // Auto-generate values
    const autoCompanyName = company_name || `${profile?.full_name || "Roofing"} Company`;
    const autoOwnerName = owner_name || profile?.full_name || user.email?.split("@")[0] || "Owner";
    
    // Generate email sending domain (use workspace ID as subdomain)
    const emailSendingDomain = `workspace-${workspace_id.slice(0, 8)}.smartsendhq.com`;

    // Update workspace
    const { error: workspaceUpdateError } = await supabase
      .from("workspaces")
      .update({
        name: autoCompanyName,
      })
      .eq("id", workspace_id);

    if (workspaceUpdateError) {
      console.error("Failed to update workspace:", workspaceUpdateError);
    }

    // Update workspace profile (if exists)
    const { data: workspaceProfile } = await supabase
      .from("workspace_profiles")
      .select("id")
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (workspaceProfile) {
      await supabase
        .from("workspace_profiles")
        .update({
          company_name: autoCompanyName,
          primary_city: null, // Will be set in step 4
          niche: "roofing",
          timezone: default_timezone,
        })
        .eq("id", workspaceProfile.id);
    } else {
      // Create workspace profile
      await supabase.from("workspace_profiles").insert({
        workspace_id,
        company_name: autoCompanyName,
        niche: "roofing",
        timezone: default_timezone,
      });
    }

    // Update activation state
    const { error: step3Error } = await supabase
      .from("roofer_activation_state")
      .update({
        account_created_at: new Date().toISOString(),
        company_name: autoCompanyName,
        owner_name: autoOwnerName,
        default_timezone,
        email_sending_domain: emailSendingDomain,
        niche_profile: "roofing",
        step_completed: 3,
      })
      .eq("id", activationState.id);

    if (step3Error) {
      return NextResponse.json(
        { error: "Failed to update step 3" },
        { status: 500 }
      );
    }

    // Get recommended roofing campaign templates
    const { data: templates } = await supabase
      .from("campaign_templates")
      .select("id, name, description, niche")
      .eq("niche", "roofing")
      .eq("is_active", true)
      .limit(5);

    return NextResponse.json({
      success: true,
      step_completed: 3,
      account_setup: {
        company_name: autoCompanyName,
        owner_name: autoOwnerName,
        default_timezone,
        email_sending_domain: emailSendingDomain,
        niche_profile: "roofing",
      },
      recommended_templates: templates || [],
      message: "Account setup complete. SmartSend feels 'done-for-you,' not DIY.",
    });
  } catch (error: any) {
    console.error("Error in step-3-account-creation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































