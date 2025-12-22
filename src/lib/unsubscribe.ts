import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export async function ensureUnsubToken(workspace_id: string, lead_id: string, email: string) {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const tok = crypto.randomBytes(16).toString("hex");
  await supa.from("unsubscribe_tokens").upsert({ workspace_id, lead_id, email: email.toLowerCase(), token: tok }, { onConflict: "lead_id" });
  return tok;
}
