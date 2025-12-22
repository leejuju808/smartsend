// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function lookupTXT(hostname: string): Promise<string[]> {
  try {
    const records = await Deno.resolveDns(hostname, "TXT");
    return records.map((r: any) => {
      if (Array.isArray(r)) {
        return r.join("");
      }
      return String(r);
    });
  } catch {
    return [];
  }
}

async function checkSPF(domain: string): Promise<boolean> {
  const txt = await lookupTXT(domain);
  return txt.some(t => t.includes("v=spf1"));
}

async function checkDMARC(domain: string): Promise<boolean> {
  const txt = await lookupTXT(`_dmarc.${domain}`);
  return txt.some(t => t.includes("v=DMARC1"));
}

async function checkDKIM(domain: string): Promise<boolean> {
  // Try common DKIM selectors
  const selectors = ["default", "mail", "google", "selector1", "s1"];
  for (const selector of selectors) {
    const txt = await lookupTXT(`${selector}._domainkey.${domain}`);
    if (txt.some(t => t.includes("v=DKIM1") || t.includes("v=DKIM"))) {
      return true;
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { domain_id, domain } = await req.json();

    // Support both domain_id and domain parameter
    let targetDomain = domain;
    let targetDomainId = domain_id;

    if (!targetDomain && targetDomainId) {
      // Fetch domain from database
      const { data: domainData, error: fetchError } = await supabaseClient
        .from("sender_domains")
        .select("domain, id")
        .eq("id", targetDomainId)
        .single();

      if (fetchError || !domainData) {
        return new Response(
          JSON.stringify({ error: "Domain not found" }),
          { status: 404, headers: { "content-type": "application/json" } }
        );
      }

      targetDomain = domainData.domain;
      targetDomainId = domainData.id;
    }

    if (!targetDomain) {
      return new Response(
        JSON.stringify({ error: "Domain or domain_id is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Normalize domain
    const normalizedDomain = targetDomain.toLowerCase().trim().split("/")[0];

    // Check DNS records
    const [spf_valid, dkim_valid, dmarc_valid] = await Promise.all([
      checkSPF(normalizedDomain),
      checkDKIM(normalizedDomain),
      checkDMARC(normalizedDomain),
    ]);

    const now = new Date().toISOString();

    // Update database if domain_id provided
    if (targetDomainId) {
      const { error: updateError } = await supabaseClient
        .from("sender_domains")
        .update({
          spf_valid,
          dkim_valid,
          dmarc_valid,
          dns_last_checked: now,
        })
        .eq("id", targetDomainId);

      if (updateError) {
        console.error("Error updating domain:", updateError);
      }

      // Recompute domain reputation score
      const { error: scoreError } = await supabaseClient.rpc(
        "compute_domain_reputation_score",
        { p_domain_id: targetDomainId }
      );

      if (scoreError) {
        console.error("Error computing reputation score:", scoreError);
      } else {
        // Update domain_health_score
        const { data: scoreData } = await supabaseClient.rpc(
          "compute_domain_reputation_score",
          { p_domain_id: targetDomainId }
        );

        if (scoreData !== null) {
          await supabaseClient
            .from("sender_domains")
            .update({ domain_health_score: scoreData })
            .eq("id", targetDomainId);
        }
      }

      // Create alerts for DNS issues
      if (!spf_valid) {
        await supabaseClient.from("domain_alerts").insert({
          domain_id: targetDomainId,
          alert_type: "spf_invalid",
          message: `SPF record is missing or invalid for ${normalizedDomain}`,
          severity: "warning",
        }).catch(() => {}); // Ignore duplicate errors
      }

      if (!dkim_valid) {
        await supabaseClient.from("domain_alerts").insert({
          domain_id: targetDomainId,
          alert_type: "dkim_invalid",
          message: `DKIM record is missing or invalid for ${normalizedDomain}`,
          severity: "warning",
        }).catch(() => {});
      }

      if (!dmarc_valid) {
        await supabaseClient.from("domain_alerts").insert({
          domain_id: targetDomainId,
          alert_type: "dmarc_missing",
          message: `DMARC record is missing for ${normalizedDomain}`,
          severity: "warning",
        }).catch(() => {});
      }

      // Apply protection if needed
      await supabaseClient.rpc("apply_domain_protection", {
        p_domain_id: targetDomainId,
      }).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        domain: normalizedDomain,
        spf_valid,
        dkim_valid,
        dmarc_valid,
        dns_last_checked: now,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error checking domain DNS:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});



