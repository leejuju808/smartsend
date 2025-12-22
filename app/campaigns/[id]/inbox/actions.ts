"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

export async function retryQueueItem(queueId: string, campaignId: string) {
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const { data: row } = await sb
    .from("send_queue")
    .select("id,status,attempts")
    .eq("id", queueId)
    .single();
  if (!row) throw new Error("Not found");

  // reset to queued now
  await sb
    .from("send_queue")
    .update({
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      fail_code: null,
      fail_kind: null
    })
    .eq("id", queueId);

  return { ok: true };
}

