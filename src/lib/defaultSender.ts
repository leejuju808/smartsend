import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, 
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getDefaultSender(userId: string) {
  const { data } = await sb
    .from("sender_identities")
    .select("from_email,status,is_default")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();
    
  if (!data || data.status !== "verified") return null;
  return data.from_email as string;
}