// Domain Verification Edge Function
// Checks DNS records for SPF, DKIM, DMARC authentication

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTxt } from "https://deno.land/x/dns/mod.ts";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
const SECRET = Deno.env.get("DOMAIN_SECRET")!;

interface CheckResult {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  health: number;
}

async function checkDomain(domain: string): Promise<CheckResult> {
  const result: CheckResult = { spf: false, dkim: false, dmarc: false, health: 0 };

  // Check SPF record
  try {
    const txt = await resolveTxt(domain);
    const flat = txt.flat().join(" ");
    if (/v=spf1/i.test(flat) && /(include|ip4|ip6):/i.test(flat)) {
      result.spf = true;
    }
  } catch (_) {
    // SPF check failed
  }

  // Check DKIM record (default._domainkey)
  try {
    const dkimDomain = `default._domainkey.${domain}`;
    const dkim = await resolveTxt(dkimDomain);
    if (dkim.flat().join("").includes("v=DKIM1")) {
      result.dkim = true;
    }
  } catch (_) {
    // DKIM check failed
  }

  // Check DMARC record
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const dmarc = await resolveTxt(dmarcDomain);
    if (dmarc.flat().join("").includes("v=DMARC1")) {
      result.dmarc = true;
    }
  } catch (_) {
    // DMARC check failed
  }

  // Calculate health score: SPF 33%, DKIM 33%, DMARC 34%
  result.health = (result.spf ? 33 : 0) + (result.dkim ? 33 : 0) + (result.dmarc ? 34 : 0);

  return result;
}

Deno.serve(async (req) => {
  // Check authorization
  const authHeader = req.headers.get("x-ss-secret");
  if (authHeader !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { domain, team_id, batch } = body;

    // Batch mode: verify all domains not checked in last 3 days
    if (batch === true) {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const threeDaysAgoISO = threeDaysAgo.toISOString();

      // Fetch domains that need checking: either never checked or checked > 3 days ago
      const { data: domainsToCheck, error: fetchError } = await sb
        .from("sender_domains")
        .select("id, domain, team_id")
        .or(`last_checked.is.null,last_checked.lt.${threeDaysAgoISO}`)
        .limit(100); // Limit to 100 domains per batch
      
      // Alternative query if or() doesn't work:
      // const { data: unchecked } = await sb.from("sender_domains").select("id, domain, team_id").is("last_checked", null).limit(50);
      // const { data: outdated } = await sb.from("sender_domains").select("id, domain, team_id").lt("last_checked", threeDaysAgoISO).limit(50);
      // const domainsToCheck = [...(unchecked || []), ...(outdated || [])].slice(0, 100);

      if (fetchError) {
        throw fetchError;
      }

      if (!domainsToCheck || domainsToCheck.length === 0) {
        return new Response(JSON.stringify({ checked: 0, message: "No domains need verification" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      let checked = 0;
      for (const record of domainsToCheck) {
        try {
          const res = await checkDomain(record.domain);
          await sb.from("sender_domains").update({
            spf_pass: res.spf,
            dkim_pass: res.dkim,
            dmarc_pass: res.dmarc,
            last_checked: new Date().toISOString(),
            health_score: res.health,
          }).eq("id", record.id);
          checked++;
        } catch (err) {
          console.error(`Error checking domain ${record.domain}:`, err);
        }
      }

      return new Response(JSON.stringify({ checked, total: domainsToCheck.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Single domain mode
    if (!domain) {
      return new Response("missing domain", { status: 400 });
    }

    // Verify domain format (basic check)
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(domain)) {
      return new Response("invalid domain format", { status: 400 });
    }

    // Perform DNS checks
    const res = await checkDomain(domain.toLowerCase());

    // Upsert into database if team_id provided
    if (team_id) {
      await sb.from("sender_domains").upsert({
        team_id,
        domain: domain.toLowerCase(),
        spf_pass: res.spf,
        dkim_pass: res.dkim,
        dmarc_pass: res.dmarc,
        last_checked: new Date().toISOString(),
        health_score: res.health,
      }, {
        onConflict: "team_id,domain",
      });
    }

    return new Response(JSON.stringify(res), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Domain verification error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

