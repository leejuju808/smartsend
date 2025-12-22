import { createClient } from "@supabase/supabase-js";

export async function getMyUserId() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}




