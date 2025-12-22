import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getABStats(campaignId: string) {
  const cookieStore = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data, error } = await sb
    .from("v_ab_stats")
    .select("*")
    .eq("campaign_id", campaignId);

  if (error) throw error;
  return data ?? [];
}

