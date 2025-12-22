import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type QueueState = "queued" | "sending" | "failed" | "canceled" | "sent" | "any";
export type AttemptsFilter = "0" | "1" | "2plus" | "any";

async function sb() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

export async function listQueueItems(opts: {
  campaignId: string;
  state?: QueueState;
  q?: string; // email search
  variant?: string;
  attempts?: AttemptsFilter;
  limit?: number;
  offset?: number;
}) {
  const {
    campaignId,
    state = "any",
    q,
    variant,
    attempts = "any",
    limit = 50,
    offset = 0,
  } = opts;

  const supabase = await sb();
  let query = supabase
    .from("send_queue")
    .select(
      "id, lead_id, campaign_id, status, attempts, scheduled_at, next_attempt_at, created_at, variant_key, subject, fail_code, fail_kind, canceled_at"
    )
    .eq("campaign_id", campaignId);

  if (state !== "any") query = query.eq("status", state);
  if (variant) query = query.eq("variant_key", variant);
  if (attempts === "0") query = query.eq("attempts", 0);
  if (attempts === "1") query = query.eq("attempts", 1);
  if (attempts === "2plus") query = query.gte("attempts", 2);

  // simple join via subquery for email search
  if (q && q.trim()) {
    const { data: leadIds } = await supabase
      .from("campaign_leads")
      .select("id")
      .eq("campaign_id", campaignId)
      .ilike("email", `%${q.trim()}%`);
    if (leadIds?.length) query = query.in("lead_id", leadIds.map((l) => l.id));
    else return { rows: [], total: 0 };
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const { data: rows, error } = await query;
  if (error) throw error;

  const { count } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  return { rows: rows ?? [], total: count ?? 0 };
}

export async function queueStats(campaignId: string) {
  const supabase = await sb();
  const statuses = ["queued", "sending", "failed", "canceled", "sent"] as const;
  const out: Record<string, number> = {};
  await Promise.all(
    statuses.map(async (s) => {
      const { count } = await supabase
        .from("send_queue")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", s);
      out[s] = count ?? 0;
    })
  );
  return out;
}
