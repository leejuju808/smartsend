import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "@/lib/googleOauth";
import { gmailSendRaw, buildRfc822 } from "@/lib/gmailSend";

export type SenderAccount = {
  id: string;
  workspace_id: string;
  provider: "gmail";
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function ensureFreshGoogleAccess(sa: SenderAccount) {
  const expMs = new Date(sa.expires_at).getTime();
  if (Date.now() < expMs - 30000) return sa.access_token;

  const tokens = await refreshAccessToken(sa.refresh_token);
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
  const { data, error } = await supabase
    .from("sender_accounts")
    .update({ access_token: tokens.access_token, expires_at: expiresAt })
    .eq("id", sa.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data.access_token as string;
}

export async function sendTestEmail(senderId: string, toEmail: string) {
  const { data: sa, error } = await supabase.from("sender_accounts").select("*").eq("id", senderId).single();
  if (error || !sa) throw new Error(error?.message || "Sender not found");

  if (sa.provider !== "gmail") throw new Error("Only gmail implemented in this slice");

  const accessToken = await ensureFreshGoogleAccess(sa as SenderAccount);
  const raw = buildRfc822({
    from: sa.email,
    to: toEmail,
    subject: "SmartSend — Test Email ✅",
    text: "This is a SmartSend test message sent via your connected Gmail account. If you received this, sending works! ⚡",
  });
  await gmailSendRaw(accessToken, raw);
  return { ok: true } as const;
}


