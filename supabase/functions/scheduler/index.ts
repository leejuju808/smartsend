// supabase/functions/scheduler/index.ts

// deno-lint-ignore-file no-explicit-any

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";



const supabase = createClient(

  Deno.env.get("SUPABASE_URL")!,

  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

);



// If you store per-campaign max attempts in a table:

async function getMaxAttempts(campaignId: string): Promise<number> {

  const { data, error } = await supabase

    .from("campaigns")

    .select("max_attempts")

    .eq("id", campaignId)

    .limit(1)

    .maybeSingle();

  if (error) throw new Error(error.message);

  return data?.max_attempts ?? 3;

}



async function getCampaignMeta(campaignId: string) {
  const { data, error } = await supabase
    .from("campaigns")
    .select("workspace_id, owner_user_id")
    .eq("id", campaignId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign not found");
  return data as { workspace_id: string; owner_user_id: string | null };
}

async function getPlanCapsByWorkspace(workspaceId: string) {
  const { data: sub, error } = await supabase
    .from("billing_subscriptions")
    .select("plan")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const plan = sub?.plan ?? 'free';
  const { data: caps, error: e2 } = await supabase
    .from("plan_limits")
    .select("hard_cap_per_day, monthly_send_cap")
    .eq("plan", plan)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  return {
    daily: caps?.hard_cap_per_day ?? 50,
    monthly: caps?.monthly_send_cap ?? 1000,
  };
}

async function getUsage(campaignId: string) {
  const daily = await supabase.rpc("sends_used", { p_campaign_id: campaignId, p_days: 1 });
  const monthly = await supabase.rpc("sends_used", { p_campaign_id: campaignId, p_days: 30 });
  if (daily.error) throw new Error(daily.error.message);
  if (monthly.error) throw new Error(monthly.error.message);
  return { daily: daily.data as number, monthly: monthly.data as number };
}

serve(async (req) => {

  try {

    const hdr = req.headers.get("x-cron-secret") ?? "";

    const expected = Deno.env.get("SCHEDULER_SECRET") ?? "";

    if (!expected || hdr !== expected) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });



    const { campaignId, batchSize = 100 } = await req.json();

    if (!campaignId) return new Response(JSON.stringify({ error: "campaignId required" }), { status: 400 });



    const maxAttempts = await getMaxAttempts(campaignId);

    const { workspace_id } = await getCampaignMeta(campaignId);
    const caps = await getPlanCapsByWorkspace(workspace_id);
    const usage = await getUsage(campaignId);

    const dailyRemaining = Math.max(caps.daily - usage.daily, 0);
    const monthlyRemaining = Math.max(caps.monthly - usage.monthly, 0);
    const capRemaining = Math.min(dailyRemaining, monthlyRemaining);

    if (capRemaining <= 0) {
      await supabase.from("campaign_logs").insert({
        workspace_id,
        campaign_id: campaignId,
        lead_id: null,
        type: "throttle",
        meta: { reason: "cap_reached", daily_used: usage.daily, monthly_used: usage.monthly, caps },
      });
      return new Response(JSON.stringify({ queued: 0, reason: "cap_reached", caps, usage }), { status: 200 });
    }



    // Pull eligible leads (skip replied; cap attempts)

    const { data: candidates, error: readErr } = await supabase

      .from("leads")

      .select("id,status,send_attempts")

      .eq("campaign_id", campaignId)

      .in("status", ["new", "queued"])

      .neq("status", "replied")

      .lt("send_attempts", maxAttempts)

      .order("created_at", { ascending: true })

      .limit(Math.min(Number(batchSize) || 100, capRemaining));



    if (readErr) throw new Error(readErr.message);

    if (!candidates?.length) return new Response(JSON.stringify({ queued: 0 }), { status: 200 });



    // Flip all to queued (idempotent for already queued)

    const ids = candidates.map((c) => c.id);

    const { error: updErr } = await supabase

      .from("leads")

      .update({ status: "queued" })

      .in("id", ids);

    if (updErr) throw new Error(updErr.message);



    // Logs
    await supabase.from("campaign_logs").insert(
      ids.map((id) => ({
        workspace_id,
        campaign_id: campaignId,
        lead_id: id,
        type: "queued",
        meta: { source: "scheduler" },
      }))
    );



    return new Response(JSON.stringify({ queued: ids.length, caps, usage_before: usage }), { status: 200 });

  } catch (e: any) {

    return new Response(JSON.stringify({ error: e?.message ?? "server_error" }), { status: 500 });

  }

});
