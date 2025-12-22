import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto/secret";
import type { SMTPAccount } from "./send";

export async function loadSMTPAccount(workspaceId: string, smtpAccountId: string): Promise<SMTPAccount | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("smtp_accounts")
    .select("id, host, port, secure, username, secret_ciphertext, from_name, from_email, rate_limit_per_minute, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("id", smtpAccountId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    host: data.host,
    port: data.port,
    secure: data.secure,
    username: data.username,
    secret: decryptSecret(data.secret_ciphertext),
    from_name: data.from_name,
    from_email: data.from_email,
    rate_limit_per_minute: data.rate_limit_per_minute,
  };
}