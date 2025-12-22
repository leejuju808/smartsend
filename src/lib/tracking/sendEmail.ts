import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { rewriteLinksAndInjectPixel } from "./withTracking";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://smartsend.ai";

export interface SendEmailArgs {
  to: string;
  subject: string;
  body: string;
  campaign_id?: string;
  user_id: string;
}

export type SendEmailResult =
  | {
      sent: true;
      email_log_id: string;
    }
  | {
      skipped: true;
      reason: "suppressed";
    };

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const supabase = createRouteHandlerClient({ cookies });

  // 1) Create email_log first to get its id
  const { data: logRows, error: logErr } = await supabase
    .from("email_logs")
    .insert({
      user_id: args.user_id,
      to_email: args.to,
      subject: args.subject,
      campaign_id: args.campaign_id ?? null,
      status: "queued"
    })
    .select("id")
    .single();

  if (logErr || !logRows) {
    throw logErr || new Error("Failed to create email log");
  }
  const email_log_id = logRows.id as string;

  // 2) Suppression check
  const { data: suppressed } = await supabase
    .from("suppression_list")
    .select("email")
    .eq("email", args.to)
    .maybeSingle();

  if (suppressed) {
    await supabase
      .from("email_logs")
      .update({ status: "skipped_suppressed" })
      .eq("id", email_log_id);
    return { skipped: true as const, reason: "suppressed" as const };
  }

  // 3) Decorate HTML: links -> redirect, add pixel
  const withPixelAndClicks = rewriteLinksAndInjectPixel(
    args.body,
    email_log_id,
    APP_URL
  );

  // 4) TODO: Send via provider (Gmail/Outlook/Resend/etc.)
  // await providerSend({ to: args.to, subject: args.subject, html: withPixelAndClicks });

  // 5) Mark as sent
  await supabase
    .from("email_logs")
    .update({
      status: "sent",
      sent_at: new Date().toISOString()
    })
    .eq("id", email_log_id);

  return { sent: true as const, email_log_id };
} 