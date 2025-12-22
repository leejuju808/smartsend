import { getProvider } from "./select-provider";
import { getValidAccessToken } from "./token-refresh";
import type { Attachment } from "../mime";

export async function sendWithAccount(
  supabase: any,
  accountId: string,
  to: string,
  subject: string,
  text: string,
  html?: string,
  attachments?: Attachment[]
) {
  const { data: acct, error } = await supabase
    .from("email_accounts")
    .select(
      "id, provider, account_email, display_name, per_minute_limit, daily_limit, last_sent_at"
    )
    .eq("id", accountId)
    .single();
  if (error || !acct) throw new Error("Email account not found");

  const accessToken = await getValidAccessToken(supabase, accountId);
  const provider = getProvider(acct.provider);

  const res = await provider.send({
    to,
    subject,
    text,
    html,
    fromEmail: acct.account_email,
    fromName: acct.display_name || undefined,
    accessToken,
    attachments,
  });

  await supabase
    .from("email_accounts")
    .update({ last_sent_at: new Date().toISOString() })
    .eq("id", accountId);

  return res;
}

import { createClient } from "@supabase/supabase-js"
import { SendRequest, SendResult } from "./types"
import { sendViaGmail } from "./providers/gmail"
import { sendViaOutlook } from "./providers/outlook"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function sendEmailAndLog(req: SendRequest): Promise<SendResult> {
  let result: SendResult
  
  if (req.provider === "gmail") {
    result = await sendViaGmail(req)
  } else {
    result = await sendViaOutlook(req)
  }

  // Persist unified log row
  const { error } = await supabase.from("campaign_logs").insert({
    lead_id: req.leadId,
    campaign_id: req.campaignId ?? null,
    provider: result.provider,
    message_id: result.messageId,
    thread_id: result.threadId,
    subject: req.subject,
    snippet: (req.bodyText || req.bodyHtml || "").slice(0, 240),
    direction: "outbound",
  })
  
  if (error) {
    // NOTE: email already sent; we still return success but warn so you can alert/telemetry.
    console.error("Failed to insert campaign_log:", error)
  }
  
  return result
}
