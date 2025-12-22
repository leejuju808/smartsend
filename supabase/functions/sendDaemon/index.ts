// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NEXT_APP_URL = Deno.env.get("NEXT_APP_URL") || "http://localhost:3000";
const SEND_DAEMON_SECRET = Deno.env.get("SEND_DAEMON_SECRET") || "";
const BATCH_SIZE = Number(Deno.env.get("SEND_BATCH_SIZE") || 50);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Warm-up schedule (cap effective daily sends by sender age)
const WARMUP = [10, 20, 40, 80, 120, 160, 200, 300, 400, 500]; // day 1..10
function effectiveDailyLimit(senderDaily: number, senderCreatedAt?: string) {
  if (!senderCreatedAt) return senderDaily;
  const days = Math.max(1, Math.floor((Date.now() - new Date(senderCreatedAt).getTime()) / 86400000) + 1);
  const warmCap = WARMUP[Math.min(days - 1, WARMUP.length - 1)];
  return Math.min(senderDaily, warmCap);
}

// Throttling and jitter config
const PER_MIN = Number(Deno.env.get("DOMAIN_RATE_PER_MIN") || 10);
const jitterMin = Number(Deno.env.get("JITTER_MS_MIN") || 250);
const jitterMax = Number(Deno.env.get("JITTER_MS_MAX") || 1200);

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function domainOf(email: string) { return (email.split("@")[1] || "").toLowerCase(); }

function inWindow() {
  const w = Deno.env.get("SEND_WINDOW_LOCAL");
  if (!w) return true;
  const tz = Deno.env.get("SEND_WINDOW_TZ") || "UTC";
  const [start, end] = w.split("-");
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  const parts = fmt.formatToParts(now);
  let h = "00", m = "00";
  for (const p of parts) {
    if (p.type === 'hour') h = p.value;
    if (p.type === 'minute') m = p.value;
  }
  const cur = `${h}:${m}`;
  return cur >= start && cur <= end;
}

// Helper: fetch campaigns that are eligible (not over daily limit) and have due items.
async function getEligibleCampaigns() {
  // Pull campaigns with at least one due queued item
  const { data: due, error } = await sb
    .from("send_queue")
    .select("campaign_id, scheduled_at")
    .eq("status", "queued")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  const ids = [...new Set((due ?? []).map((d: any) => d.campaign_id))];
  if (ids.length === 0) return [];

  // Join daily limits + sent_today
  const { data: camps, error: cErr } = await sb
    .from("campaigns")
    .select("id, daily_limit")
    .in("id", ids);
  if (cErr) throw cErr;

  // Sent today by campaign
  const { data: sentToday, error: sErr } = await sb
    .from("campaigns_sent_today")
    .select("campaign_id, sent_today")
    .in("campaign_id", ids);
  if (sErr) throw sErr;

  const sentMap = new Map((sentToday ?? []).map((r: any) => [r.campaign_id, r.sent_today]));
  return (camps ?? []).filter((c: any) => (sentMap.get(c.id) ?? 0) < c.daily_limit);
}

async function reserveBatch(campaignId: string, cap: number) {
  const { data, error } = await sb.rpc("reserve_send_queue", { p_campaign: campaignId, p_batch: cap });
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; lead_id: string; to_email: string; subject: string; body_html: string }>;
}

async function markSent(id: string) {
  await sb.from("send_queue").update({ status: "sent", locked_at: null, last_error: null }).eq("id", id);
}

async function markFailed(id: string, err: string) {
  await sb.from("send_queue").update({ status: "failed", locked_at: null, last_error: err }).eq("id", id);
}

async function logEvent(campaign_id: string, lead_id: string | null, type: string, detail: any) {
  await sb.from("campaign_logs").insert({ campaign_id, lead_id, type, detail });
}

async function getSenderProfile(campaignId: string) {
  const { data: camp } = await sb.from("campaigns")
    .select("id, sender_profile_id, user_id")
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp?.sender_profile_id) return null;

  const { data: prof } = await sb.from("sender_profiles")
    .select("id, provider, email, access_token, refresh_token, expires_at, created_at, daily_limit")
    .eq("id", camp.sender_profile_id)
    .maybeSingle();
  return prof ? { ...prof, user_id: camp.user_id } : null;
}

async function sendOne(campaignId: string, item: { id: string; lead_id: string; to_email: string; subject: string; body_html: string }) {
  try {
    const profile = await getSenderProfile(campaignId);
    if (!profile) {
      throw new Error("No sender_profile configured for this campaign");
    }

    // Call Next.js API route to handle provider-specific sending
    const sendResponse = await fetch(`${NEXT_APP_URL}/api/senders/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SEND_DAEMON_SECRET && { "Authorization": `Bearer ${SEND_DAEMON_SECRET}` })
      },
      body: JSON.stringify({
        queueId: item.id,
        campaignId: campaignId
      })
    });

    if (!sendResponse.ok) {
      const errorData = await sendResponse.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(errorData.error || `Send failed: ${sendResponse.statusText}`);
    }

    const result = await sendResponse.json();
    await markSent(item.id);
    await logEvent(campaignId, item.lead_id, "sent", { 
      queue_id: item.id, 
      provider: result.provider || profile.provider 
    });
  } catch (e) {
    await markFailed(item.id, String(e));
    await logEvent(campaignId, item.lead_id, "failed", { queue_id: item.id, error: String(e) });
  }
}

serve(async (req) => {
  // Optional: simple auth for webhook trigger (cron will call internally; keep a guard)
  const secret = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (expected && secret !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const eligible = await getEligibleCampaigns();
    if (!eligible.length) return new Response(JSON.stringify({ processed: 0, campaigns: 0 }), { headers: { "Content-Type": "application/json" } });

    let processed = 0;
    for (const c of eligible) {
      // Compute remaining quota today for this campaign
      const { data: sentTodayRow } = await sb
        .from("campaigns_sent_today")
        .select("sent_today")
        .eq("campaign_id", c.id)
        .maybeSingle();

      // Get sender profile for warm-up cap
      const profile = await getSenderProfile(c.id);
      const capDaily = effectiveDailyLimit(profile?.daily_limit ?? c.daily_limit, profile?.created_at);
      const used = (sentTodayRow as any)?.sent_today ?? 0;
      const remaining = Math.max(0, Math.min(c.daily_limit, capDaily) - used);
      if (remaining === 0) continue;

      const cap = Math.min(BATCH_SIZE, remaining);
      const batch = await reserveBatch(c.id, cap);
      if (!batch.length) continue;

      // Per-domain counters for the current minute
      const domCount = new Map<string, number>();
      const userId = profile?.user_id || null;

      // Fire sends sequentially with guardrails
      for (const item of batch) {
        if (!inWindow()) continue; // skip until within window

        // Suppression check (skip politely)
        if (userId) {
          const { data: supp } = await sb.from("suppressions")
            .select("id")
            .eq("user_id", userId)
            .eq("email", item.to_email.toLowerCase())
            .maybeSingle();
          if (supp) {
            await sb.from("send_queue").update({ status: "cancelled", last_error: "suppressed" }).eq("id", item.id);
            await logEvent(c.id, item.lead_id, "info", { reason: "suppressed" });
            continue;
          }
        }

        const dom = domainOf(item.to_email);
        const sentSoFar = domCount.get(dom) ?? 0;
        if (sentSoFar >= PER_MIN) {
          continue; // defer implicitly; next cron will pick up
        }

        await logEvent(c.id, item.lead_id, "sending", { queue_id: item.id });

        // Jitter
        const jitter = Math.floor(jitterMin + Math.random() * (jitterMax - jitterMin));
        await sleep(jitter);

        await sendOne(c.id, item);
        domCount.set(dom, sentSoFar + 1);
      }

      processed += batch.length;
    }

    return new Response(JSON.stringify({ processed, campaigns: eligible.length }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

