// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const SHORTENERS = new Set(["bit.ly","t.co","goo.gl","tinyurl.com","rb.gy","rebrand.ly","cutt.ly","ow.ly","is.gd","s.id","lnkd.in"]);

function isShortener(host: string) { return SHORTENERS.has(host.toLowerCase()); }

// DNS helpers using Deno std
async function hasTXT(domain: string, pattern: RegExp) {
  try {
    const res = await Deno.resolveDns(domain, "TXT");
    for (const row of res) {
      const txt = Array.isArray(row) ? row.join("") : row;
      if (pattern.test(txt)) return true;
    }
  } catch {} // ignore
  return false;
}

async function hasMX(domain: string) {
  try { 
    const res = await Deno.resolveDns(domain, "MX"); 
    return (res?.length ?? 0) > 0; 
  } catch { 
    return false; 
  }
}

async function httpsAlive(domain: string) {
  try {
    const r = await fetch(`https://${domain}`, { redirect: "manual", method: "GET", signal: AbortSignal.timeout(5000) });
    // 2xx/3xx is fine
    return r.status >= 200 && r.status < 400;
  } catch { 
    return false; 
  }
}

/** Very light blocklist heuristics (optional): mark "bad" for common sinkholes.
 * In production, integrate a vendor or your own curated list. */
function simpleReputation(domain: string): { blocklisted: boolean; rep: "good"|"warn"|"bad"; note?: string } {
  const badTLDs = new Set(["tk","gq","ml","ga","cf"]);
  const tld = domain.split(".").pop() ?? "";
  if (badTLDs.has(tld)) return { blocklisted: false, rep: "warn", note: "low-reputation TLD heuristic" };
  return { blocklisted: false, rep: "good" };
}

async function claimBatch(limit = 50) {
  const { data } = await sb
    .from("domain_health_queue")
    .select("domain")
    .lte("next_attempt_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .limit(limit);
  return (data ?? []).map(d => d.domain as string);
}

async function markAttempt(domain: string, ok: boolean) {
  const next = ok ? 30_000 : 5 * 60_000; // 30s success cooldown vs 5m retry
  
  // Get current attempts count
  const { data: current } = await sb
    .from("domain_health_queue")
    .select("attempts")
    .eq("domain", domain)
    .maybeSingle();
  
  const attempts = (current?.attempts ?? 0) + 1;
  
  await sb.from("domain_health_queue")
    .update({ 
      next_attempt_at: new Date(Date.now() + next).toISOString(), 
      attempts: attempts
    })
    .eq("domain", domain);
}

export async function handler() {
  const batch = await claimBatch(40);
  if (!batch.length) return new Response("no domains", { status: 200 });

  for (const domain of batch) {
    try {
      const shortener = isShortener(domain);
      const spf_ok = await hasTXT(domain, /^v=spf1\s/i);
      const dkim_ok = await hasTXT(`default._domainkey.${domain}`, /^v=DKIM1;?/i) // common selector 'default'
                    || await hasTXT(`selector1._domainkey.${domain}`, /^v=DKIM1;?/i)
                    || await hasTXT(`s1._domainkey.${domain}`, /^v=DKIM1;?/i);
      const dmarc_ok = await hasTXT(`_dmarc.${domain}`, /^v=DMARC1;?/i);
      const mx_ok = await hasMX(domain);
      const https_ok = await httpsAlive(domain);

      const rep = simpleReputation(domain);
      const reputation = rep.rep;
      const blocklisted = rep.blocklisted;

      await sb.from("domain_health").upsert({
        domain,
        last_checked_at: new Date().toISOString(),
        spf_ok, dkim_ok, dmarc_ok, mx_ok, https_ok,
        reputation,
        blocklisted,
        shortener,
        notes: rep.note ?? null
      });

      await markAttempt(domain, true);
    } catch (e) {
      console.error("domain check fail", domain, e);
      await markAttempt(domain, false);
    }
  }

  return new Response(`checked ${batch.length}`, { status: 200 });
}

Deno.serve(handler);














