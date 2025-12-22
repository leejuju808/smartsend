import { createClient } from "@supabase/supabase-js";

export async function verifyApiKey(key: string) {
  if (!key || !key.startsWith("sk_live_")) throw new Error("Missing or invalid API key");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .from("api_keys")
    .select("workspace_id, status, id")
    .eq("api_key", key)
    .single();

  if (error || !data) throw new Error("Invalid API key");
  if (data.status !== "active") throw new Error("API key revoked");

  return data.workspace_id;
}