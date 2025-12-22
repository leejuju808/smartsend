"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

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

export async function retryFailedBulk(campaignId: string, ids: string[]) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = await sb();
  await supabase
    .from("send_queue")
    .update({
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      fail_code: null,
      fail_kind: null,
    })
    .eq("campaign_id", campaignId)
    .in("id", ids)
    .eq("status", "failed");

  return { ok: true };
}

export async function cancelQueuedBulk(campaignId: string, ids: string[]) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = await sb();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("send_queue")
    .update({
      canceled_at: new Date().toISOString(),
      canceled_by: user!.id,
      status: "canceled",
    })
    .eq("campaign_id", campaignId)
    .in("id", ids)
    .eq("status", "queued")
    .is("canceled_at", null);

  return { ok: true };
}

export async function smartRetryTransient(campaignId: string, ids: string[]) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  if (!ids?.length) return { ok: true, retried: 0 };

  const supabase = await sb();

  // Fetch only transient failures from the chosen ids
  const { data: rows, error } = await supabase
    .from("send_queue")
    .select("id, attempts, fail_kind")
    .eq("campaign_id", campaignId)
    .in("id", ids)
    .eq("status", "failed")
    .eq("fail_kind", "transient");

  if (error) throw error;
  if (!rows?.length) return { ok: true, retried: 0 };

  // Compute per-row backoff
  // Note: we compute client-side seconds and set next_attempt_at individually
  const { computeBackoffSeconds } = await import("@/lib/send/backoff");
  
  const updates = rows.map(r => {
    const secs = computeBackoffSeconds((r.attempts ?? 0) + 1, "transient");
    return {
      id: r.id,
      next_attempt_at: new Date(Date.now() + secs * 1000).toISOString(),
    };
  });

  // Batched UPSERT-style update for each row's next_attempt_at
  for (const u of updates) {
    await supabase.from("send_queue")
      .update({
        status: "queued",
        next_attempt_at: u.next_attempt_at,
        last_error: null,
        fail_code: null,
        fail_kind: null
      })
      .eq("campaign_id", campaignId)
      .eq("id", u.id)
      .eq("status", "failed"); // guard against races
  }

  return { ok: true, retried: updates.length };
}

