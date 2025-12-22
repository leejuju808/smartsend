import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendWithAccount } from "@/lib/email/send";
import type { Attachment } from "@/lib/mime";

export type SendWithSenderArgs = {
  senderAccountId: string;
  to: string;
  subject: string;
  textOrHtml: string;
  attachments?: Attachment[];
  campaignId?: string | null;
  leadId?: string | null;
};

/**
 * Minimal sender dispatcher (v1).
 *
 * This repo has multiple historical "account" tables. For end-to-end sending now,
 * we resolve a `sender_accounts` row to an `email_accounts` row by matching email.
 *
 * Why:
 * - `send_queue` rows are stamped with `sender_account_id`
 * - `sendWithAccount` already knows how to send via Gmail/Outlook for `email_accounts`
 */
export async function sendWithSender(args: SendWithSenderArgs): Promise<{
  provider: string;
  messageId?: string;
  threadId?: string;
  headers?: Record<string, string>;
  threadUrl?: string;
}> {
  const sb = supabaseAdmin;

  const { data: sender, error: senderErr } = await sb
    .from("sender_accounts")
    .select("*")
    .eq("id", args.senderAccountId)
    .maybeSingle();

  if (senderErr || !sender) {
    throw new Error(senderErr?.message || "Sender account not found");
  }

  const senderEmail: string | null =
    (sender as any).email || (sender as any).from_email || null;
  if (!senderEmail) throw new Error("Sender account missing email");

  // Best-effort mapping: pick an `email_accounts` row with matching account_email.
  const { data: emailAcct, error: eaErr } = await sb
    .from("email_accounts")
    .select("id")
    .ilike("account_email", senderEmail)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (eaErr || !emailAcct?.id) {
    throw new Error(
      eaErr?.message ||
        `No connected email_account found for sender ${senderEmail}`
    );
  }

  const text = stripHtml(args.textOrHtml);
  const html = looksLikeHtml(args.textOrHtml) ? args.textOrHtml : undefined;

  const res = await sendWithAccount(
    sb,
    emailAcct.id,
    args.to,
    args.subject,
    text,
    html,
    args.attachments
  );

  if (!res?.ok) {
    throw new Error(res?.error || "send failed");
  }

  return {
    provider: String((sender as any).provider || "unknown"),
    messageId: (res as any).messageId,
  };
}

function looksLikeHtml(s: string) {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function stripHtml(html: string) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}








