import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function inQuietHours(now: Date, quiet?: {start?:string; end?:string; tz?:string}) {
  if (!quiet?.start || !quiet?.end) return false;
  // naive: interpret in server TZ; for production, convert using tz lib
  const toMin = (hhmm:string)=>{ const [h,m]=hhmm.split(":").map(Number); return h*60+(m||0); };
  const n = now.getHours()*60+now.getMinutes();
  const s = toMin(quiet.start), e = toMin(quiet.end);
  return s < e ? (n >= s && n < e) : (n >= s || n < e); // spans midnight
}

serve(async (req) => {
  try {
    const { org_id, pool_id } = await req.json();
    const now = new Date();

    // Load pool + members + senders
    const { data: pool } = await supa.from("sender_pools").select("*").eq("id", pool_id).maybeSingle();
    if (!pool) throw new Error("Pool not found");

    if (inQuietHours(now, pool.quiet_hours || undefined)) {
      return new Response(JSON.stringify({ blocked: true, reason: "quiet_hours" }), { status: 200 });
    }

    const { data: members } = await supa
      .from("sender_pool_members").select("weight, sender_accounts(*)")
      .eq("pool_id", pool_id);
    const senders = (members||[])
      .map((m:any)=>({ ...m.sender_accounts, weight: m.weight }))
      .filter((s:any)=>s?.is_active && (!s.cooldown_until || new Date(s.cooldown_until) <= now));

    if (!senders.length) throw new Error("No active senders in pool");

    // Load usage for the minute + today
    const minuteBucket = new Date(now); minuteBucket.setSeconds(0,0);
    const dayStr = now.toISOString().slice(0,10);
    const { data: usageRows } = await supa
      .from("sender_usage")
      .select("sender_id, sent_count, minute_count")
      .eq("day", dayStr)
      .eq("minute_bucket", minuteBucket.toISOString());

    const usageMap = new Map<string,{sent:number;minute:number}>();
    (usageRows||[]).forEach((u:any)=>usageMap.set(u.sender_id, {sent: u.sent_count, minute: u.minute_count}));

    // Score senders by strategy
    let pick: any = null;
    if (pool.strategy === "weighted") {
      // Build pool respecting per-minute caps
      const bag:string[] = [];
      for (const s of senders) {
        const u = usageMap.get(s.id) || {sent:0,minute:0};
        const dailyLimit = Math.min(s.daily_cap, s.warmup ? Math.ceil(s.daily_cap*0.4) : s.daily_cap);
        if (u.minute >= s.per_min_cap || u.sent >= dailyLimit) continue;
        for (let i=0;i<Math.max(1,s.weight);i++) bag.push(s.id);
      }
      if (bag.length) pick = bag[Math.floor(Math.random()*bag.length)];
    } else if (pool.strategy === "least_loaded") {
      const candidates = senders
        .map((s:any)=>{
          const u = usageMap.get(s.id) || {sent:0,minute:0};
          return { s, u,
            dailyLimit: Math.min(s.daily_cap, s.warmup ? Math.ceil(s.daily_cap*0.4) : s.daily_cap)
          };
        })
        .filter(x=>x.u.minute < x.s.per_min_cap && x.u.sent < x.dailyLimit)
        .sort((a,b)=> (a.u.minute - b.u.minute) || (a.u.sent - b.sent));
      if (candidates.length) pick = candidates[0].s.id;
    } else { // round_robin (naive: choose with lowest minute count, tie-break by sent)
      const candidates = senders
        .map((s:any)=> {
          const u = usageMap.get(s.id) || {sent:0,minute:0};
          return { s, u,
            dailyLimit: Math.min(s.daily_cap, s.warmup ? Math.ceil(s.daily_cap*0.4) : s.daily_cap)
          };
        })
        .filter(x=>x.u.minute < x.s.per_min_cap && x.u.sent < x.dailyLimit)
        .sort((a,b)=> (a.u.minute - b.u.minute) || (a.u.sent - b.u.sent));
      if (candidates.length) pick = candidates[0].s.id;
    }

    if (!pick) {
      return new Response(JSON.stringify({ blocked: true, reason: "rate_limited" }), { status: 200 });
    }

    return new Response(JSON.stringify({ sender_id: pick, minuteBucket: minuteBucket.toISOString(), day: dayStr }), { status: 200 });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
});

