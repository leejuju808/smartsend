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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const { domain } = await req.json();

    if (!domain) {
      return new Response(JSON.stringify({ error: "Domain is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

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
    const { error: updateError } = await supabaseClient
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

    if (updateError) {
      console.error("Error updating domain:", updateError);
      // Continue anyway to return the check results
    }

    return new Response(
      JSON.stringify({
        spf_valid,
        dkim_valid,
        dmarc_valid,
        mx_valid,
        health,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error checking domain:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});



