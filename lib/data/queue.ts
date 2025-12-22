"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function sb() {
  const cookieStore = cookies();
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

export async function queueHealthStats(campaignId: string) {
  const supabase = sb();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ count: sentLastHour }, { count: failedLastHour }] = await Promise.all([
    supabase
      .from("send_logs")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .gte("sent_at", since),
    supabase
      .from("send_queue")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .gte("created_at", since),
  ]);

  // avg attempts across active items (queued/sending/failed)
  const { data: avgAttemptsData } = await supabase
    .from("send_queue")
    .select("attempts")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "sending", "failed"]);

  // Calculate average attempts
  let avgAttempts = 0;
  if (avgAttemptsData && avgAttemptsData.length > 0) {
    const sum = avgAttemptsData.reduce((acc, row) => acc + (row.attempts || 0), 0);
    avgAttempts = sum / avgAttemptsData.length;
  }

  // oldest queued age (prefers scheduled_at)
  const { data: oldestRow } = await supabase
    .from("send_queue")
    .select("scheduled_at, created_at")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const sent = sentLastHour ?? 0;
  const failed = failedLastHour ?? 0;
  const errorRate = sent + failed === 0 ? 0 : failed / (sent + failed);

  let oldestQueuedSec = 0;
  if (oldestRow) {
    const t = oldestRow.scheduled_at ?? oldestRow.created_at;
    if (t) {
      oldestQueuedSec = Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 1000));
    }
  }

  return { hour: { sent, failed, errorRate }, avgAttempts, oldestQueuedSec };
}

export async function listQueueItems(
  campaignId: string,
  opts?: {
    status?: string;
    q?: string;
    variant?: string;
    attempts?: string;
    limit?: number;
    offset?: number;
  }
) {
  const supabase = sb();
  let query = supabase
    .from("send_queue")
    .select("*", { count: "exact" })
    .eq("campaign_id", campaignId);

  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.q) query = query.or(`subject.ilike.%${opts.q}%,body.ilike.%${opts.q}%`);
  if (opts?.variant) query = query.eq("variant_key", opts.variant);
  if (opts?.attempts) {
    const attemptsNum = parseInt(opts.attempts);
    if (!isNaN(attemptsNum)) query = query.eq("attempts", attemptsNum);
  }

  query = query.order("created_at", { ascending: false });

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: data ?? [],
    total: count ?? 0,
  };
}

export async function queueStats(campaignId: string) {
  const supabase = sb();
  const { data, error } = await supabase
    .from("send_queue")
    .select("status")
    .eq("campaign_id", campaignId);

  if (error) throw error;

  const stats = {
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
  };

  (data || []).forEach((row) => {
    const status = row.status;
    if (status === "queued") stats.queued++;
    else if (status === "sending") stats.sending++;
    else if (status === "sent") stats.sent++;
    else if (status === "failed") stats.failed++;
  });

  return stats;
}

export type VariantBreak = {
  variant_key: string | null;
  sent: number;
  failed: number;
  errorRate: number; // failed / (sent+failed)
};

export async function sustainedErrorHint(campaignId: string, opts?: { windowMin?: number; threshold?: number }) {
  const windowMin = opts?.windowMin ?? 10;     // last 10 minutes
  const threshold = opts?.threshold ?? 0.2;    // 20%+ error rate
  const supabase = sb();
  const since = new Date(Date.now() - windowMin * 60 * 1000).toISOString();

  const [{ count: sent }, { count: failed }] = await Promise.all([
    supabase.from("send_logs")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId).gte("sent_at", since),
    supabase.from("send_queue")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId).eq("status", "failed").gte("created_at", since),
  ]);

  const s = sent ?? 0, f = failed ?? 0;
  const er = s + f === 0 ? 0 : f / (s + f);
  const showHint = er >= threshold && (s + f) >= 10; // need some volume
  return { windowMin, sent: s, failed: f, errorRate: er, showHint };
}

export async function variantBreakdown(campaignId: string, windowMin = 60): Promise<VariantBreak[]> {
  const supabase = sb();
  const since = new Date(Date.now() - windowMin * 60 * 1000).toISOString();

  // Sent by variant (last window)
  const { data: sentRows } = await supabase
    .from("send_logs")
    .select("variant_key")
    .eq("campaign_id", campaignId)
    .gte("sent_at", since);

  // Failed by variant (using queue failures created in window)
  const { data: failRows } = await supabase
    .from("send_queue")
    .select("variant_key")
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .gte("created_at", since);

  const map = new Map<string | null, { sent: number; failed: number }>();
  
  // Count sent by variant
  for (const r of sentRows ?? []) {
    const k = r.variant_key ?? null;
    const cur = map.get(k) ?? { sent: 0, failed: 0 };
    cur.sent++;
    map.set(k, cur);
  }

  // Count failed by variant
  for (const r of failRows ?? []) {
    const k = r.variant_key ?? null;
    const cur = map.get(k) ?? { sent: 0, failed: 0 };
    cur.failed++;
    map.set(k, cur);
  }

  const out: VariantBreak[] = [];
  for (const [k, v] of map) {
    const total = v.sent + v.failed;
    out.push({ variant_key: k, sent: v.sent, failed: v.failed, errorRate: total ? v.failed / total : 0 });
  }
  // include variants that only failed or only sent; above map already handles both
  // sort by highest error rate then by volume
  out.sort((a, b) => (b.errorRate - a.errorRate) || ((b.sent + b.failed) - (a.sent + a.failed)));
  return out;
}

