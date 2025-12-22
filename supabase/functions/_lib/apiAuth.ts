// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  return data;
}

export async function verifyApiKey(supabase: ReturnType<typeof createClient>, key: string) {
  if (!key || key.length < 20) return { ok: false as const, error: "invalid key" };

  const prefix = key.substring(0, 10);
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, billing_account_id, scopes, status, expires_at")
    .eq("prefix", prefix)
    .single();

  if (error || !data) return { ok: false as const, error: "not found" };
  if (data.status !== "active") return { ok: false as const, error: "revoked" };
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { ok: false as const, error: "expired" };

  const { data: matches } = await supabase.rpc("compare_api_hash", { p_api_key_id: data.id, p_hex: hash });
  if (!matches) return { ok: false as const, error: "bad hash" };

  return { ok: true as const, key: data };
}


