import { createClient } from "@supabase/supabase-js";

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { "X-Client-Info": "smartsend/events" } } }
  );
}

export async function recordEvent(userId: string | null, event: string, meta: any = {}) {
  const sb = getClient();
  await sb.from("events").insert({ user_id: userId, event, meta });
} 