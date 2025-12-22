import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

export async function authenticateApiKey(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) throw new Error("missing_api_key");

  const hash = createHash("sha256").update(apiKey).digest("hex");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: key } = await supabase
    .from("api_keys")
    .select("*")
    .eq("key_hash", hash)
    .single();

  if (!key) throw new Error("invalid_api_key");

  // update last used
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id);

  return key.workspace_id;
}



