import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { sendMail } from "@/lib/mailer";

/**
 * POST /api/workspaces/invite
 * Create a workspace invite and send email
 */
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name) => cookieStore.get(name)?.value } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { workspaceId, email, role = "member" } = await req.json();
    if (!workspaceId || !email) {
      return NextResponse.json({ error: "Missing workspaceId or email" }, { status: 400 });
    }

    // Validate role
    if (!['owner', 'admin', 'member', 'readonly'].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Check user is admin/owner
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden: Only admins can invite" }, { status: 403 });
    }

    // Create invite via RPC
    const { data: inviteId, error: inviteError } = await supabase.rpc(
      "create_workspace_invite",
      {
        p_workspace_id: workspaceId,
        p_email: email.toLowerCase(),
        p_role: role,
      }
    );

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    // Get the token for the invite
    const { data: invite } = await supabase
      .from("workspace_invites")
      .select("token")
      .eq("id", inviteId)
      .single();

    if (!invite) {
      return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
    }

    // Get workspace name for email
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || new URL(req.url).origin;
    const inviteUrl = `${baseUrl}/invite/${invite.token}`;

    // Send invitation email
    try {
      const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
      await sendMail({
        to: email,
        from: process.env.FROM_EMAIL || "noreply@smartsend.ai",
        subject: `You've been invited to join ${workspace?.name || "a workspace"} on SmartSend`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">You've been invited to join SmartSend!</h2>
            <p>You've been invited to collaborate on <strong>${workspace?.name || "a workspace"}</strong> as a <strong>${roleDisplay}</strong>.</p>
            <p>Click the button below to accept the invitation:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Accept Invitation
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              This link will expire in 3 days. If you didn't expect this invitation, you can safely ignore this email.
            </p>
            <p style="color: #666; font-size: 14px;">
              Or copy this link: <a href="${inviteUrl}">${inviteUrl}</a>
            </p>
          </div>
        `,
        text: `You've been invited to join ${workspace?.name || "a workspace"} on SmartSend as a ${roleDisplay}. Accept the invitation: ${inviteUrl}`,
      });
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
      // Continue even if email fails - invite is still created
    }

    return NextResponse.json({ ok: true, inviteId, link: inviteUrl });
  } catch (e: any) {
    console.error("Error creating workspace invite:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
