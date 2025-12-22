import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function getDeliverabilityDaily(teamId: string, days = 30) {
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

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  
  const { data, error } = await sb
    .from("mv_deliverability_daily")
    .select("*")
    .eq("team_id", teamId)
    .gte("day", since)
    .order("day", { ascending: true });

  if (error) throw error;

  // compute rates for charts
  return (data ?? []).map(d => {
    const sent = d.sent || 0;
    const rate = (n: number) => (sent > 0 ? +(100 * n / sent).toFixed(2) : 0);
    return {
      ...d,
      bounce_rate_pct: rate((d.soft_bounces || 0) + (d.hard_bounces || 0)),
      complaint_rate_pct: rate(d.complaints || 0),
      reply_rate_pct: rate(d.replies || 0)
    };
  });
}

