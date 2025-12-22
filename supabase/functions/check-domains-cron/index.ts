// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function lookup(type: string, hostname: string): Promise<any[]> {
  try {
    return await Deno.resolveDns(hostname, type);
  } catch {
    return [];
  }
}

async function checkDomain(domain: string) {
  try {
    // Lookup DNS records
    const spfRecords = await lookup("TXT", domain);
    const dkimRecords = await lookup("TXT", `_domainkey.${domain}`);
    const dmarcRecords = await lookup("TXT", `_dmarc.${domain}`);
    const mxRecords = await lookup("MX", domain);

    // Parse records
    const spf_valid = spfRecords.some((r: any) => {
      const txt = Array.isArray(r) ? r.join("") : String(r);
      return txt.includes("v=spf1");
    });

    const dkim_valid = dkimRecords.length > 0;

    const dmarc_valid = dmarcRecords.some((r: any) => {
      const txt = Array.isArray(r) ? r.join("") : String(r);
      return txt.includes("v=DMARC1");
    });

    const mx_valid = mxRecords.length > 0;

    // Determine health status
    const health =
      spf_valid && dkim_valid && dmarc_valid && mx_valid
        ? "excellent"
        : dkim_valid && spf_valid
          ? "good"
          : "poor";

    // Update database
    await supabaseClient
      .from("sender_domains")
      .update({
        spf_valid,
        dkim_valid,
        dmarc_valid,
        mx_valid,
        health,
        last_check: new Date().toISOString(),
      })
      .eq("domain", domain);

    return { domain, health, success: true };
  } catch (error: any) {
    console.error(`Error checking domain ${domain}:`, error);
    return { domain, health: "poor", success: false, error: error.message };
  }
}

Deno.serve(async () => {
  try {
    // Get all domains that need checking
    // Check domains that haven't been checked in the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: domains, error } = await supabaseClient
      .from("sender_domains")
      .select("domain")
      .or(`last_check.is.null,last_check.lt.${fifteenMinutesAgo}`)
      .limit(50); // Process up to 50 domains per run

    if (error) {
      console.error("Error fetching domains:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    if (!domains || domains.length === 0) {
      return new Response(
        JSON.stringify({ message: "No domains to check", checked: 0 }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // Check all domains in parallel
    const results = await Promise.all(
      domains.map((d) => checkDomain(d.domain))
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        checked: domains.length,
        successful,
        failed,
        results,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in check-domains-cron:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});



