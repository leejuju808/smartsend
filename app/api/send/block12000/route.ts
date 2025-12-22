/**
 * Block 12000 — Example Send Email Route with Subscription Enforcement
 * 
 * This is an example API route that demonstrates how to use Block 12000
 * subscription enforcement middleware for sending emails.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  requireSubscriptionAndEmailLimit,
} from "@/lib/billing/subscription-middleware";
import { incrementEmailUsage } from "@/lib/billing/subscription-enforcement";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore,
    });

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Block 12000: Check subscription and email limit
    const limitCheck = await requireSubscriptionAndEmailLimit(user.id);
    if (limitCheck) {
      return limitCheck;
    }

    // Parse request body
    const body = await req.json();
    const { to, subject, body_html, campaign_id } = body;

    if (!to || !subject || !body_html) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body_html" },
        { status: 400 }
      );
    }

    // TODO: Actually send the email using your email provider
    // For now, we'll just simulate sending

    // Block 12000: Increment email usage counter
    await incrementEmailUsage(user.id);

    // Log the send (if you have a sends table)
    const { data: sendLog, error: logError } = await supabase
      .from("send_queue")
      .insert({
        user_id: user.id,
        campaign_id: campaign_id || null,
        to_email: to,
        subject,
        body_html,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      console.error("Error logging send:", logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json(
      {
        success: true,
        message: "Email sent successfully",
        send_id: sendLog?.id,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































