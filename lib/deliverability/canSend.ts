// lib/deliverability/canSend.ts
// Mailbox quota + hot-domain guard

import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}

export async function canSend({
  accountId,
  campaignId,
  mailboxEmail,
}: {
  accountId: string;
  campaignId: string;
  mailboxEmail: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const sb = getSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: camp }, { data: sh }] = await Promise.all([
    sb
      .from("campaigns")
      .select("max_daily_sends_per_mailbox,bounce_halt_threshold,complaint_halt_threshold")
      .eq("id", campaignId)
      .single(),
    sb
      .from("sender_health")
      .select("sends,bounces,complaints")
      .eq("account_id", accountId)
      .eq("mailbox_email", mailboxEmail)
      .eq("day", today)
      .maybeSingle(),
  ]);

  const sends = sh?.sends ?? 0;
  const bounceRate = sends ? (sh?.bounces ?? 0) / sends : 0;
  const complaintRate = sends ? (sh?.complaints ?? 0) / sends : 0;

  if (sends >= (camp?.max_daily_sends_per_mailbox ?? 200)) {
    return { ok: false, reason: "quota_reached" };
  }
  if (bounceRate >= (camp?.bounce_halt_threshold ?? 0.05)) {
    return { ok: false, reason: "domain_hot_bounce" };
  }
  if (complaintRate >= (camp?.complaint_halt_threshold ?? 0.002)) {
    return { ok: false, reason: "domain_hot_complaint" };
  }

  return { ok: true };
}















