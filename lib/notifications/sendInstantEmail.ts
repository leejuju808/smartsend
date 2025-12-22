// lib/notifications/sendInstantEmail.ts
// Block 16200 — Send instant email notifications for hot/warm leads

import { sendEmail } from "@/lib/email";
import { getNotificationSettings } from "./getNotificationSettings";
import { createClient } from "@/lib/supabase/server";

type IntentLabel =
  | "hot_lead"
  | "warm_lead"
  | "follow_up"
  | "not_interested"
  | "unsubscribe"
  | "unknown";

export async function sendInstantReplyNotification(params: {
  workspaceId: string;
  contactId: string;
  intentLabel: IntentLabel;
  replyBody: string;
}) {
  const supabase = createClient();
  const { workspaceId, contactId, intentLabel, replyBody } = params;

  const settings = await getNotificationSettings(workspaceId);

  const isHot = intentLabel === "hot_lead";
  const isWarm = intentLabel === "warm_lead";

  // Skip if unsub / no
  if (intentLabel === "not_interested" || intentLabel === "unsubscribe") {
    return;
  }

  // Check whether we should send
  if (!settings.instant_any_reply_email && !isHot && !isWarm) {
    // owner only wants hot leads
    if (!settings.instant_hot_lead_email || !isHot) return;
  }

  // Load workspace owner + contact
  const [{ data: ownerMember }, { data: contact }] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("role", "owner")
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("first_name, last_name, email, city, est_job_value, lead_status")
      .eq("id", contactId)
      .single(),
  ]);

  if (!ownerMember?.user_id || !contact) return;

  // Get owner email using admin client
  const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
  const adminSupabase = createAdminSupabaseClient();
  const { data: ownerUser } = await adminSupabase.auth.admin.getUserById(ownerMember.user_id);
  const ownerEmail = ownerUser?.user?.email;
  
  if (!ownerEmail) return;

  const name =
    contact.first_name || contact.last_name
      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
      : contact.email;

  const subjectPrefix = isHot
    ? "🔥 New HOT lead replied"
    : isWarm
    ? "New warm lead replied"
    : "New homeowner reply";

  const subject = `${subjectPrefix}: ${name}`;

  const cityPart = contact.city ? ` (${contact.city})` : "";
  const estValue = contact.est_job_value
    ? `Estimated value: $${Number(contact.est_job_value).toLocaleString()}`
    : "";

  const body = `
${subjectPrefix}${cityPart}

Homeowner: ${name}
Email: ${contact.email}
${contact.city ? "City: " + contact.city : ""}
${estValue ? estValue : ""}
Current status: ${contact.lead_status || "n/a"}

Last reply:
--------------------------------
${replyBody}
--------------------------------

Open this lead in SmartSend:
- Inbox: ${process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com"}/inbox
- Contact: ${process.env.NEXT_PUBLIC_SITE_URL || "https://app.smartsendhq.com"}/contacts/${encodeURIComponent(
    String(contactId)
  )}
`;

  await sendEmail({
    to: ownerEmail,
    subject,
    text: body,
    html: body.replace(/\n/g, "<br>"),
  });

  await supabase.from("notification_logs").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    type: isHot ? "instant_hot_lead" : "instant_reply",
    meta: {
      intent: intentLabel,
    },
  });
}

