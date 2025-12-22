import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function fetchInbox(campaignId: string, opts?: {
  q?: string; status?: string; dateFrom?: string; dateTo?: string; limit?: number;
}) {
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

  let q = sb.from("v_team_inbox")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("scheduled_at", { ascending: false })
    .limit(opts?.limit ?? 50);

  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.dateFrom) q = q.gte("scheduled_at", opts.dateFrom);
  if (opts?.dateTo) q = q.lte("scheduled_at", opts.dateTo);
  if (opts?.q) q = q.ilike("lead_email", `%${opts.q}%`);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchActivity(campaignId: string, limit = 100) {
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
    .from("activity_logs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

