import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sha256Hex } from "@/lib/crypto";

export async function authenticateExtension(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  
  const token = m[1].trim();
  const token_hash = sha256Hex(token);

  const supabaseAdmin = createAdminClient();
  const { data } = await supabaseAdmin
    .from("extension_tokens")
    .select("user_id, revoked, expires_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!data || data.revoked || (data.expires_at && new Date(data.expires_at) < new Date())) {
    return null;
  }

  // Touch last_used_at (best-effort, don't block on this)
  supabaseAdmin
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", token_hash)
    .then(() => {}, () => {}); // Ignore errors

  return data.user_id as string;
} 