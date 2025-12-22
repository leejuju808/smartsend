import { supabase } from "@/lib/supabaseClient";
import { rewriteLinksAndInjectPixel } from "@/lib/tracking/withTracking";
import { withUnsubscribeFooter } from "./withUnsubscribe";
import { gmailSendThroughWorkspace } from "@/lib/providers/gmail/send";
import { ActivityLogger } from "@/lib/activity-log";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

export async function sendEmail(args: {
  to: string; from: string; subject: string; body: string; campaign_id?: string; workspace_id: string;
}) {
  // 1) log row
  const { data: logRow, error: logErr } = await supabase
    .from("email_logs")
    .insert({
      to_address: args.to,
      from_address: args.from,
      subject: args.subject,
      campaign_id: args.campaign_id ?? null,
      status: "queued",
      workspace_id: args.workspace_id
    })
    .select("id")
    .single();
  if (logErr) throw logErr;
  const email_log_id = logRow.id as string;

  // 2) suppression
  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("email")
    .eq("workspace_id", args.workspace_id)
    .eq("email", args.to)
    .maybeSingle();
  if (suppressed) {
    await supabase.from("email_logs").update({ status: "skipped_suppressed" }).eq("id", email_log_id);
    return { skipped: true as const, reason: "suppressed" as const };
  }

  // 3) decorate HTML
  const tracked = rewriteLinksAndInjectPixel(args.body, email_log_id, APP_URL);
  const finalHtml = withUnsubscribeFooter(tracked, args.campaign_id, args.to);

  // 4) send via Gmail (active connection for this workspace)
  await gmailSendThroughWorkspace(args.workspace_id, {
    to: args.to,
    subject: args.subject,
    html: finalHtml,
    campaignId: args.campaign_id ?? null
  });

  // 5) mark success
  await supabase.from("email_logs")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", email_log_id);

  // 6) Block 20900: Track email usage
  try {
    const { trackEmailSent } = await import('@/lib/billing/email-enforcement-helper');
    await trackEmailSent(null, args.campaign_id, args.workspace_id, 1);
  } catch (error) {
    console.error('Failed to track email usage:', error);
    // Don't fail the send if tracking fails
  }

  // 7) Track usage for metered billing (credits first, then Stripe)
  try {
    const { recordUsage } = await import("@/lib/usage-tracking");
    await recordUsage(args.workspace_id, "emails_sent", 1);
  } catch (error) {
    // Non-critical: continue even if usage tracking fails
    console.warn("Failed to track email usage:", error);
  }

  // 7) Log activity for Activity Log
  try {
    // Try to get lead info if we have the email
    const { data: lead } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name")
      .eq("workspace_id", args.workspace_id)
      .eq("email", args.to)
      .limit(1)
      .maybeSingle();

    await ActivityLogger.emailSent({
      workspace_id: args.workspace_id,
      campaign_id: args.campaign_id || null,
      lead_id: lead?.id || null,
      to_email: args.to,
      to_name: lead?.first_name || lead?.last_name ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() : null,
      subject: args.subject,
    });
  } catch (error) {
    // Non-critical: continue even if activity logging fails
    console.warn("Failed to log email activity:", error);
  }

  return { sent: true as const, email_log_id };
}