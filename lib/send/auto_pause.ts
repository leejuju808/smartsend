"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

function sbService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function shouldPauseLead(campaignId: string, leadId: string): Promise<boolean> {
  const supabase = await sb();

  // Get campaign threshold
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("auto_pause_threshold")
    .eq("id", campaignId)
    .maybeSingle();

  const threshold = Math.max(1, campaign?.auto_pause_threshold ?? 3);

  // Pull last N queue events for the lead
  const { data: q } = await supabase
    .from("send_queue")
    .select("status, fail_kind, created_at")
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(threshold);

  // If the newest N are all 'failed', auto-pause
  if ((q?.length ?? 0) < threshold) return false;
  return q!.every(x => x.status === "failed");
}

export async function shouldPauseLeadService(campaignId: string, leadId: string): Promise<boolean> {
  const supabase = sbService();

  // Get campaign threshold
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("auto_pause_threshold")
    .eq("id", campaignId)
    .maybeSingle();

  const threshold = Math.max(1, campaign?.auto_pause_threshold ?? 3);

  // Pull last N queue events for the lead
  const { data: q } = await supabase
    .from("send_queue")
    .select("status, fail_kind, created_at")
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(threshold);

  // If the newest N are all 'failed', auto-pause
  if ((q?.length ?? 0) < threshold) return false;
  return q!.every(x => x.status === "failed");
}

