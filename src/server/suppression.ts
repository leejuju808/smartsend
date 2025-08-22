import { supabaseAdmin } from "@/server/supabase";

export async function isSuppressed(owner: string, email: string) {
  const { data } = await supabaseAdmin
    .from("suppressions")
    .select("email, expires_at")
    .eq("owner", owner)
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (!data) return false;
  if ((data as any).expires_at && new Date((data as any).expires_at) < new Date()) return false;
  return true;
}

export async function addSuppression(params: {
  owner: string;
  email: string;
  reason: "bounce" | "complaint" | "manual";
  source: "send_error" | "webhook" | "manual";
  details?: any;
  expires_at?: string | null;
}) {
  const row = {
    owner: params.owner,
    email: params.email.toLowerCase(),
    reason: params.reason,
    source: params.source,
    details: params.details ?? null,
    expires_at: params.expires_at ?? null,
  } as any;
  await supabaseAdmin.from("suppressions").upsert(row, { onConflict: "owner,email" } as any);
}

export function classifySendError(e: any): "hard_bounce" | "soft_bounce" | "unknown" {
  const code = Number(e?.responseCode || e?.status || 0);
  const msg = String(e?.message || e?.response || "").toLowerCase();

  if ([550, 551, 552, 553, 554].includes(code)) return "hard_bounce";
  if (/mailbox unavailable|user unknown|no such user|relaying denied|recipient address rejected/.test(msg)) return "hard_bounce";
  if (/5\.1\.[01]|5\.2\.[01]|5\.7\./.test(msg)) return "hard_bounce";

  if ([421, 450, 451, 452].includes(code)) return "soft_bounce";
  if (/mailbox full|temporar|try again|greylist|rate limit/.test(msg)) return "soft_bounce";

  return "unknown";
}

