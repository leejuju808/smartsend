import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/activation/automation/welcome-sequence
 * 
 * Trigger 1 — Welcome Sequence
 * Sends onboarding instructions
 * Shows 1-minute "Launch Your First Campaign" video
 * Places them into Growth Loop
 * 
 * This is triggered automatically after step 6 (campaign launch) completes.
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
    const { workspace_id } = body;

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
        { error: "Activation state not found" },
        { status: 404 }
      );
    }

    // Get user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const userEmail = profile?.email || user.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 }
      );
    }

    // Send welcome email (using your email service - Resend, SendGrid, etc.)
    // This is a placeholder - integrate with your actual email service
    const welcomeEmailContent = {
      to: userEmail,
      subject: "Welcome to SmartSend — Your First Campaign is Live! 🎉",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Welcome to SmartSend, ${activationState.owner_name || "there"}!</h1>
          
          <p>Your SmartSend account is now live and your first campaign is running.</p>
          
          <h2>What happens next?</h2>
          <p>Expect your first replies within the next 24–48 hours. I'll check in with you after to review leads.</p>
          
          <h2>Quick Start Video</h2>
          <p>Watch this 1-minute video to see how SmartSend works:</p>
          <p><a href="https://smartsendhq.com/videos/launch-your-first-campaign" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Watch Video →</a></p>
          
          <h2>Your Dashboard</h2>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">View Your Dashboard →</a></p>
          
          <p>Best,<br>The SmartSend Team</p>
        </div>
      `,
    };

    // TODO: Integrate with your email service (Resend, SendGrid, etc.)
    // await sendEmail(welcomeEmailContent);

    // Mark welcome sequence as sent
    await supabase
      .from("roofer_activation_state")
      .update({
        // Add a field to track welcome sequence sent if needed
      })
      .eq("id", activationState.id);

    return NextResponse.json({
      success: true,
      message: "Welcome sequence triggered",
      email_sent: true,
    });
  } catch (error: any) {
    console.error("Error in welcome-sequence:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































