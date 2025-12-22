// Block 11000 — Step 2: Connect Sending Email API
// POST /api/onboarding/step-2-email

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
    const { fromEmail, fromName, testEmail } = body;

    if (!fromEmail) {
      return NextResponse.json(
        { error: "Missing required field: fromEmail" },
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

    // Create or update sending identity (from Block 9200)
    // First, unset any existing default
    await supabase
      .from("sending_identities")
      .update({ is_default: false })
      .eq("workspace_id", workspaceId)
      .eq("is_default", true);

    // Upsert new sending identity as default
    const { data: identity, error: identityError } = await supabase
      .from("sending_identities")
      .upsert(
        {
          workspace_id: workspaceId,
          from_email: fromEmail,
          from_name: fromName || fromEmail.split("@")[0],
          is_default: true,
          verified: false, // Will be verified later via DNS/provider setup
        },
        {
          onConflict: "workspace_id,from_email",
        }
      )
      .select()
      .single();

    if (identityError) {
      console.error("Error saving sending identity:", identityError);
      return NextResponse.json(
        { error: "Failed to save sending email" },
        { status: 500 }
      );
    }

    // If test email provided, send test email (optional - can be done separately)
    if (testEmail) {
      // TODO: Implement test email sending via your email service
      // For now, just mark as verified for v1
      console.log("Test email requested to:", testEmail);
    }

    // Update onboarding status
    const { error: updateError } = await supabase
      .from("onboarding_status")
      .update({ step_2_done: true })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating onboarding status:", updateError);
    }

    return NextResponse.json(
      {
        success: true,
        identity,
        message: "Sending email connected successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error in step-2-email:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}























































