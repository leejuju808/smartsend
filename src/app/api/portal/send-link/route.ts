// Block 38900 — SmartSend Roofing Customer Portal v1
// API Route: POST /api/portal/send-link
// Send portal link to homeowner via email

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/sendEmail";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { lead_id, job_id, email } = await req.json();

    if (!lead_id || !job_id || !email) {
      return NextResponse.json(
        { error: "lead_id, job_id, and email are required" },
        { status: 400 }
      );
    }

    // Verify user has access to this job
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check if user is team member
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("id, teams:team_id(workspace_id)")
      .eq("team_id", job.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Create portal session
    const { data: sessionData, error: sessionError } = await supabase.rpc(
      "create_portal_session",
      {
        p_lead_id: lead_id,
        p_job_id: job_id,
        p_expires_in_days: 30, // 30 days for email links
      }
    );

    if (sessionError) {
      console.error("Error creating portal session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create portal session" },
        { status: 500 }
      );
    }

    // Build portal URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const portalUrl = `${baseUrl}/portal?token=${sessionData.token}`;

    // Get workspace_id from team
    const workspaceId = (teamMember.teams as any)?.workspace_id;

    // Send email with portal link
    const emailSubject = "Access Your Project Portal";
    const emailBody = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1f2937; margin-bottom: 16px;">Your Project Portal is Ready</h2>
        <p style="color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
          You can now track your roofing project in real-time. View photos, timeline updates, invoices, and more—all in one place.
        </p>
        <div style="margin: 32px 0;">
          <a href="${portalUrl}" 
             style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
            Access Your Portal
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
          This link will expire in 30 days. If you need a new link, please contact us.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          If the button doesn't work, copy and paste this link into your browser:<br />
          <a href="${portalUrl}" style="color: #2563eb; word-break: break-all;">${portalUrl}</a>
        </p>
      </div>
    `;

    // Get user's email for from address
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const fromEmail = userProfile?.email || user.email || "noreply@smartsend.ai";

    // Send email
    if (workspaceId) {
      try {
        await sendEmail({
          to: email,
          from: fromEmail,
          subject: emailSubject,
          body: emailBody,
          workspace_id: workspaceId,
        });
      } catch (emailError) {
        console.error("Error sending email:", emailError);
        // Continue even if email fails - return the URL
      }
    }

    // Log activity
    await supabase.from("homeowner_portal_activity").insert({
      lead_id,
      job_id,
      event: "portal_link_sent",
      metadata: {
        email,
        session_id: sessionData.session_id,
      },
    });

    return NextResponse.json({
      ok: true,
      url: portalUrl,
      token: sessionData.token,
      expires_at: sessionData.expires_at,
      email_sent: !!workspaceId,
    });
  } catch (error: any) {
    console.error("Error in /api/portal/send-link:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































