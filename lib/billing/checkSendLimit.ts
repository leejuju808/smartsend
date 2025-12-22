// lib/billing/checkSendLimit.ts
import { SupabaseClient } from "@supabase/supabase-js";

export type SendLimitResult = {
  allowed: boolean;
  planTier: string;
  monthlyLimit: number;
  currentCount: number;
  remaining: number;
};

export async function checkSendLimitOrThrow(
  supabase: SupabaseClient<any>,
  accountId: string,
  emailsToSend: number = 1
): Promise<SendLimitResult> {
  const { data, error } = await supabase.rpc("can_account_send_emails", {
    p_account_id: accountId,
    p_emails_to_send: emailsToSend,
  });

  if (error) {
    console.error("[SendLimit] RPC error", error);
    throw new Error("Unable to verify email send limits right now.");
  }

  const row = data?.[0];
  if (!row) {
    throw new Error("Unable to read email send limits.");
  }

  const result: SendLimitResult = {
    allowed: row.allowed,
    planTier: row.plan_tier,
    monthlyLimit: row.monthly_limit,
    currentCount: row.current_count,
    remaining: row.remaining,
  };

  if (!result.allowed) {
    // Here you can customize the message based on plan
    const msg =
      result.planTier === "starter"
        ? `Starter plan limit reached (${result.monthlyLimit} emails/month). Upgrade to Growth or Domination to send more.`
        : result.planTier === "growth"
        ? `Growth plan limit reached (${result.monthlyLimit} emails/month). Upgrade to Domination for higher volume.`
        : `Email send limit reached.`;

    const err: any = new Error(msg);
    err.code = "SEND_LIMIT_REACHED";
    err.meta = result;
    throw err;
  }

  return result;
}

