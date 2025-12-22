import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
function hashKey(k: string){ return crypto.createHash("sha256").update(k).digest("hex"); }

export async function authenticateApiKey(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) return { ok:false, status:401, msg:"Missing Bearer token" as const };
  const key = authorization.slice("Bearer ".length).trim();
  const { data: row } = await sb
    .from("api_keys")
    .select("id,user_id")
    .eq("key_hash", hashKey(key))
    .maybeSingle();
  if (!row) return { ok:false, status:401, msg:"Invalid API key" as const };

  // rate limit (simple per-minute cap; tune as needed)
  const cap = Number(process.env.API_RATE_PER_MIN || "300");
  const { data: count } = await sb.rpc("api_usage_inc", { p_key_id: row.id });
  if ((count as any) > cap) return { ok:false, status:429, msg:"Rate limit exceeded" as const };

  await sb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok:true, userId: row.user_id, keyId: row.id };
}