import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole } from "@/lib/auth/requireAccountRole";
import { randomBytes } from "crypto";

// POST /api/settings/team/invite - Invite a team member
export async function POST(req: NextRequest) {
  try {
    // Only owners can invite
    const gate = await requireAccountRole(["owner"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json(
        { error: "Email and role are required" },
        { status: 400 }
      );
    }

    if (!["manager", "staff"].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'manager' or 'staff'" },
        { status: 400 }
      );
    }

    const { roleData } = gate;
    const accountId = roleData.account_id;

    // Check if user already exists in this account
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("account_id", accountId)
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: "User is already a member of this account" },
        { status: 400 }
      );
    }

    // Check if there's a pending invite
    const { data: existingInvite } = await supabase
      .from("user_invites")
      .select("id")
      .eq("account_id", accountId)
      .eq("email", email.toLowerCase())
      .eq("accepted", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json(
        { error: "Invite already sent to this email" },
        { status: 400 }
      );
    }

    // Generate invite token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // Create invite
    const { data: invite, error: inviteError } = await supabase
      .from("user_invites")
      .insert({
        account_id: accountId,
        email: email.toLowerCase(),
        role,
        token,
        expires_at: expiresAt.toISOString(),
        invited_by: roleData.user_id,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invite:", inviteError);
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
        to: email.toLowerCase(),
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
      // Continue even if email fails - return the link for manual sharing
    }

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expires_at: invite.expires_at,
      },
      invite_link: inviteLink, // For manual sharing if email fails
    });
  } catch (error: any) {
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




