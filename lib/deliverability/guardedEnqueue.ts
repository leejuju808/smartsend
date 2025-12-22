// lib/deliverability/guardedEnqueue.ts
// Compose hook: compute risk + throttle

import { createClient } from "@supabase/supabase-js";
import { riskScore } from "./riskScore";
import { runPreflight } from "@/lib/content/preflight";
import { canSend } from "./canSend";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}

export async function guardedEnqueue({
  accountId,
  campaignId,
  contactId,
  mailboxEmail,
  subject,
  body,
  templateId,
  variantId,
  toneUsed,
}: {
  accountId: string;
  campaignId: string;
  contactId?: string | null;
  mailboxEmail: string;
  subject: string;
  body: string;
  templateId?: string | null;
  variantId?: string | null;
  toneUsed?: string | null;
}): Promise<{
  status: "enqueued" | "throttled" | "blocked";
  reason?: string;
  risk?: number;
}> {
  const sb = getSupabaseClient();

  // brand preflight (hard fail if issues)
  const pf = await runPreflight({
    campaignId,
    contactId: contactId ?? null,
    templateId: templateId ?? null,
    variantId: variantId ?? null,
    subject,
    body,
    tone: toneUsed ?? null,
  });
  if (!pf.ok) {
    throw new Error("Preflight failed");
  }

  // mailbox/domain health
  const quota = await canSend({ accountId, campaignId, mailboxEmail });
  if (!quota.ok) {
    // Return throttle info - caller should store this
    return { status: "throttled", reason: quota.reason };
  }

  // content risk
  const risk = riskScore(subject, body);
  const { data: camp } = await sb
    .from("campaigns")
    .select("risk_block_threshold,risk_warn_threshold")
    .eq("id", campaignId)
    .single();

  if (risk >= (camp?.risk_block_threshold ?? 0.75)) {
    // Return block info - caller should store this
    return { status: "blocked", reason: "content_risky", risk };
  }

  // Check for warning threshold
  if (risk >= (camp?.risk_warn_threshold ?? 0.55)) {
    // Optional: attach a warning note/flag for UI
    await sb.from("send_preflight_logs").insert({
      campaign_id: campaignId,
      contact_id: contactId ?? null,
      template_id: templateId ?? null,
      template_variant_id: variantId ?? null,
      tone_used: toneUsed ?? null,
      status: "warn",
      issues: [{ code: "RISK_WARN", msg: `Spam risk ${risk.toFixed(2)}` }],
    });
  }

  // proceed → enqueue send (store risk on record)
  // Note: This function can work with both scheduled_messages and send_queue
  // For send_queue, we return the risk/throttle info to be stored by the caller
  return { status: "enqueued", risk };
}

