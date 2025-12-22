import { sendMail } from "@/lib/mailer";

export async function notifyInviteCreated({
  to,
  role,
  campaignName,
  actionLink,
}: {
  to: string;
  role: "viewer" | "editor";
  campaignName: string;
  actionLink: string;
}) {
  const subject = `You've been invited to ${campaignName} on SmartSend`;
  const text = `You were invited as ${role}. Click to accept: ${actionLink}`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You've been invited to collaborate on a SmartSend campaign</h2>
      <p>Hi there,</p>
      <p>You've been invited to join <strong>${campaignName}</strong> as a <strong>${role}</strong>.</p>
      <p>
        <a href="${actionLink}" style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Click to accept and sign in
        </a>
      </p>
      <p>This link grants access to the specific campaign after you sign in with this email: <strong>${to}</strong>.</p>
      <p>If you didn't expect this, you can ignore the message.</p>
      <p style="margin-top: 32px; color: #666;">
        — SmartSend ⚡
      </p>
    </div>
  `;

  try {
    await sendMail({
      to,
      from: process.env.FROM_EMAIL || "noreply@smartsend.ai",
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error("Failed to send invite notification:", error);
    throw error;
  }
}

export async function notifyInviteAccepted({
  ownerEmail,
  inviteeEmail,
  campaignName,
}: {
  ownerEmail: string;
  inviteeEmail: string;
  campaignName: string;
}) {
  const subject = `${inviteeEmail} joined ${campaignName}`;
  const text = `${inviteeEmail} accepted the invite to ${campaignName}.`;
  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Campaign Invite Accepted</h2>
      <p>Hi there,</p>
      <p><strong>${inviteeEmail}</strong> has accepted your invite to join <strong>${campaignName}</strong>.</p>
      <p>They now have access to the campaign and can collaborate with you.</p>
      <p style="margin-top: 32px; color: #666;">
        — SmartSend ⚡
      </p>
    </div>
  `;

  try {
    await sendMail({
      to: ownerEmail,
      from: process.env.FROM_EMAIL || "noreply@smartsend.ai",
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error("Failed to send invite acceptance notification:", error);
    // Don't throw - this is a fire-and-forget notification
  }
}

