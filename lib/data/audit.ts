"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function writeAudit(campaignId: string, event_type: string, meta: any = {}) {
  const cookieStore = await cookies();
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
  
  const { data: { user } } = await sb.auth.getUser();
  
  await sb.from("activity_logs").insert({
    campaign_id: campaignId,
    lead_id: meta?.lead_id ?? null,
    actor_id: user?.id ?? null,
    event_type,
    meta
  });
}

