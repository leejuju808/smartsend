// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  try {
    console.log("Starting domain health cron...");

    // Fetch all domains that need checking
    // Check domains that haven't been checked in the last 24 hours
    const { data: domains, error: domainsError } = await supabase
      .from("sender_domains")
      .select("id, domain, dns_last_checked")
      .or(
        `dns_last_checked.is.null,dns_last_checked.lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}`
      )
      .limit(50); // Process 50 domains at a time

    if (domainsError) {
      console.error("Error fetching domains:", domainsError);
      return new Response(
        JSON.stringify({ error: domainsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!domains || domains.length === 0) {
      console.log("No domains need checking");
      return new Response(
        JSON.stringify({ ok: true, checked: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let checked = 0;
    let errors = 0;

    // Check each domain's DNS
    for (const domain of domains) {
      try {
        // Call domain-dns-checker function
        const checkResponse = await fetch(
          `${supabaseUrl}/functions/v1/domain-dns-checker`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({ domain_id: domain.id }),
          }
        );

        if (checkResponse.ok) {
          checked++;
          console.log(`Checked domain ${domain.domain} (${domain.id})`);
        } else {
          errors++;
          console.error(
            `Error checking domain ${domain.domain}:`,
            await checkResponse.text()
          );
        }
      } catch (err: any) {
        errors++;
        console.error(`Error checking domain ${domain.domain}:`, err);
      }
    }

    // Recompute reputation scores for all domains (batch)
    const { data: allDomains } = await supabase
      .from("sender_domains")
      .select("id");

    if (allDomains) {
      for (const domain of allDomains) {
        try {
          // Recompute score
          const { data: score, error: scoreError } = await supabase.rpc(
            "compute_domain_reputation_score",
            { p_domain_id: domain.id }
          );

          if (!scoreError && score !== null) {
            // Update domain_health_score
            await supabase
              .from("sender_domains")
              .update({ domain_health_score: score })
              .eq("id", domain.id);

            // Apply protection
            await supabase.rpc("apply_domain_protection", {
              p_domain_id: domain.id,
            });
          }
        } catch (err) {
          console.error(`Error recomputing score for domain ${domain.id}:`, err);
        }
      }
    }

    // Increment warmup stage for domains in warmup phase
    const { data: warmupDomains } = await supabase
      .from("sender_domains")
      .select("id, warmup_stage, domain_health_score")
      .gte("warmup_stage", 0)
      .lt("warmup_stage", 60); // Only increment up to 60 days

    if (warmupDomains) {
      for (const domain of warmupDomains) {
        // Only increment if domain health is acceptable
        if (domain.domain_health_score >= 50) {
          await supabase
            .from("sender_domains")
            .update({ warmup_stage: (domain.warmup_stage || 0) + 1 })
            .eq("id", domain.id);
        }
      }
    }

    console.log(`Domain health cron completed. Checked: ${checked}, Errors: ${errors}`);

    return new Response(
      JSON.stringify({
        ok: true,
        checked,
        errors,
        total_domains: domains.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in domain-health-cron:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



