import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole } from "@/lib/auth/requireAccountRole";
import { randomBytes } from "crypto";

// POST /api/settings/team/resend-invite - Resend an invitation
export async function POST(req: NextRequest) {
  try {
    // Only owners can resend invites
    const gate = await requireAccountRole(["owner"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { inviteId } = body;

    if (!inviteId) {
      return NextResponse.json(
        { error: "Invite ID is required" },
        { status: 400 }
      );
    }

    const { roleData } = gate;
    const accountId = roleData.account_id;

    // Get the invite
    const { data: invite } = await supabase
      .from("user_invites")
      .select("id, email, role")
      .eq("id", inviteId)
      .eq("account_id", accountId)
      .eq("accepted", false)
      .single();

    if (!invite) {
      return NextResponse.json(
        { error: "Invite not found or already accepted" },
        { status: 404 }
      );
    }

    // Cancel old invite
    await supabase
      .from("user_invites")
      .update({ accepted: true })
      .eq("id", inviteId);

    // Generate new invite token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create new invite
    const { data: newInvite, error: inviteError } = await supabase
      .from("user_invites")
      .insert({
        account_id: accountId,
        email: invite.email.toLowerCase(),
        role: invite.role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: roleData.user_id,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating new invite:", inviteError);
      return NextResponse.json(
        { error: inviteError.message },
        { status: 500 }
      );
    }

    // Get company name for email
    const { data: account } = await supabase
      .from("billing_accounts")
      .select("company_name")
      .eq("id", accountId)
      .single();

    const companyName = account?.company_name || "SmartSend";
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite?token=${token}`;

    // Send invitation email
    try {
      const { sendMail } = await import("@/lib/mailer");
      await sendMail({
        from: process.env.FROM_EMAIL || "noreply@smartsend.ai",
        to: invite.email.toLowerCase(),
        subject: `${companyName} invited you to SmartSend`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited to SmartSend</h2>
            <p><strong>${companyName}</strong> invited you to join their SmartSend account.</p>
            <p>Click the button below to accept the invitation:</p>
            <p>
              <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px;">
                Accept Invitation
              </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">${inviteLink}</p>
            <p style="color: #666; font-size: 12px; margin-top: 24px;">
              This invitation will expire in 7 days.
            </p>
          </div>
        `,
        text: `${companyName} invited you to join their SmartSend account. Accept the invitation: ${inviteLink}`,
      });
    } catch (emailError) {
      console.error("Error sending invite email:", emailError);
      // Continue even if email fails
    }

    return NextResponse.json({
      ok: true,
      invite: {
        id: newInvite.id,
        email: newInvite.email,
        role: newInvite.role,
        expires_at: newInvite.expires_at,
      },
    });
  } catch (error: any) {
    console.error("Error resending invite:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































