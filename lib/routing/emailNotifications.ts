// lib/routing/emailNotifications.ts
// Block 9600 — Email notification templates for Smart Routing

import { sendEmailWithHtml } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

export type RoutingIntent = "hot" | "warm";

interface ContactInfo {
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  city?: string | null;
}

interface OwnerInfo {
  email: string;
  name?: string | null;
}

/**
 * Get account owner email address
 */
async function getAccountOwnerEmail(
  supabase: ReturnType<typeof createClient>,
  accountId: string
): Promise<OwnerInfo | null> {
  // First try to get from accounts table
  const { data: account } = await supabase
    .from("accounts")
    .select("owner_user_id")
    .eq("id", accountId)
    .maybeSingle();

  if (account?.owner_user_id) {
    // Get user email from auth
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminSupabaseClient();
    const { data: userData } = await adminSupabase.auth.admin.getUserById(
      account.owner_user_id
    );

    if (userData?.user?.email) {
      return {
        email: userData.user.email,
        name: userData.user.user_metadata?.full_name || null,
      };
    }
  }

  // Fallback: account_id might be a user_id directly
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminSupabaseClient();
    const { data: userData } = await adminSupabase.auth.admin.getUserById(
      accountId
    );

    if (userData?.user?.email) {
      return {
        email: userData.user.email,
        name: userData.user.user_metadata?.full_name || null,
      };
    }
  } catch (err) {
    console.error("Failed to get owner email:", err);
  }

  return null;
}

/**
 * Send hot lead alert email
 */
export async function sendHotLeadAlert(params: {
  accountId: string;
  contact: ContactInfo;
  summary?: string | null;
  nextAction?: string | null;
  replyText?: string | null;
  leadUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { accountId, contact, summary, nextAction, replyText, leadUrl } =
    params;

  const owner = await getAccountOwnerEmail(supabase, accountId);
  if (!owner) {
    return { success: false, error: "Owner email not found" };
  }

  const homeownerName =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email;

  const city = contact.city ? ` in ${contact.city}` : "";

  const subject = `🔥 New HOT Roofing Lead – ${homeownerName}${city}`;

  const cleanedReply = replyText
    ? replyText.slice(0, 1000).replace(/\n/g, "<br>")
    : "No reply text available";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626; margin-bottom: 20px;">
        🔥 New HOT Lead – ${homeownerName}${city}
      </h2>
      
      <p style="font-size: 16px; line-height: 1.6;">
        <strong>${homeownerName}</strong> just replied and they're ready to talk.
      </p>

      ${replyText ? `
      <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
        <h3 style="margin-top: 0; color: #374151;">Their message:</h3>
        <p style="margin: 0; color: #6b7280; white-space: pre-wrap;">${cleanedReply}</p>
      </div>
      ` : ""}

      ${summary ? `
      <div style="background: #eff6ff; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1e40af;">AI Summary:</h3>
        <p style="margin: 0; color: #1e3a8a;">${summary}</p>
      </div>
      ` : ""}

      ${nextAction ? `
      <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #92400e;">Suggested Next Action:</h3>
        <p style="margin: 0; color: #78350f;">${nextAction}</p>
      </div>
      ` : ""}

      <div style="margin: 30px 0;">
        <a href="${leadUrl}" 
           style="display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          View this lead in SmartSend →
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        SmartSend will pause all follow-ups on this lead until you take action.
      </p>
    </div>
  `;

  const text = `
🔥 New HOT Roofing Lead – ${homeownerName}${city}

${homeownerName} just replied and they're ready to talk.

${replyText ? `Their message:\n${replyText.slice(0, 1000)}\n` : ""}

${summary ? `AI Summary:\n${summary}\n` : ""}

${nextAction ? `Suggested Next Action:\n${nextAction}\n` : ""}

View this lead: ${leadUrl}

SmartSend will pause all follow-ups on this lead until you take action.
  `.trim();

  try {
    const result = await sendEmailWithHtml({
      to: owner.email,
      subject,
      html,
      text,
    });

    return { success: result.ok || false, error: result.error };
  } catch (error: any) {
    console.error("Failed to send hot lead alert:", error);
    return { success: false, error: error.message || "Email send failed" };
  }
}

/**
 * Send warm lead alert email
 */
export async function sendWarmLeadAlert(params: {
  accountId: string;
  contact: ContactInfo;
  summary?: string | null;
  nextAction?: string | null;
  replyText?: string | null;
  leadUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const { accountId, contact, summary, nextAction, replyText, leadUrl } =
    params;

  const owner = await getAccountOwnerEmail(supabase, accountId);
  if (!owner) {
    return { success: false, error: "Owner email not found" };
  }

  const homeownerName =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email;

  const city = contact.city ? ` in ${contact.city}` : "";

  const subject = `🟠 Warm Lead – ${homeownerName}${city}`;

  const cleanedReply = replyText
    ? replyText.slice(0, 1000).replace(/\n/g, "<br>")
    : "No reply text available";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #ea580c; margin-bottom: 20px;">
        🟠 Warm Lead – ${homeownerName}${city}
      </h2>
      
      <p style="font-size: 16px; line-height: 1.6;">
        <strong>${homeownerName}</strong> replied and may be interested.
      </p>

      ${replyText ? `
      <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ea580c;">
        <h3 style="margin-top: 0; color: #374151;">Their message:</h3>
        <p style="margin: 0; color: #6b7280; white-space: pre-wrap;">${cleanedReply}</p>
      </div>
      ` : ""}

      ${summary ? `
      <div style="background: #eff6ff; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1e40af;">AI Summary:</h3>
        <p style="margin: 0; color: #1e3a8a;">${summary}</p>
      </div>
      ` : ""}

      ${nextAction ? `
      <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #92400e;">Suggested Next Action:</h3>
        <p style="margin: 0; color: #78350f;">${nextAction}</p>
      </div>
      ` : ""}

      <div style="margin: 30px 0;">
        <a href="${leadUrl}" 
           style="display: inline-block; background: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Review this lead in SmartSend →
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        SmartSend will pause all follow-ups on this lead until you take action.
      </p>
    </div>
  `;

  const text = `
🟠 Warm Lead – ${homeownerName}${city}

${homeownerName} replied and may be interested.

${replyText ? `Their message:\n${replyText.slice(0, 1000)}\n` : ""}

${summary ? `AI Summary:\n${summary}\n` : ""}

${nextAction ? `Suggested Next Action:\n${nextAction}\n` : ""}

Review this lead: ${leadUrl}

SmartSend will pause all follow-ups on this lead until you take action.
  `.trim();

  try {
    const result = await sendEmailWithHtml({
      to: owner.email,
      subject,
      html,
      text,
    });

    return { success: result.ok || false, error: result.error };
  } catch (error: any) {
    console.error("Failed to send warm lead alert:", error);
    return { success: false, error: error.message || "Email send failed" };
  }
}

