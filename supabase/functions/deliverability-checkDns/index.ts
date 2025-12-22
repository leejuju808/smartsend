// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase credentials" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { domain_settings_id, domain, dkim_selector } = payload;

  if (!domain_settings_id && !domain) {
    return new Response(JSON.stringify({ error: "domain_settings_id or domain is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  let domainToCheck = domain;
  let dkimSelector = dkim_selector || "smartsend";
  let orgId: string | null = null;

  // If domain_settings_id provided, fetch domain info
  if (domain_settings_id) {
    const { data: domainSettings, error: dsError } = await supabase
      .from("domain_settings")
      .select("domain, dkim_selector, org_id")
      .eq("id", domain_settings_id)
      .single();

    if (dsError || !domainSettings) {
      return new Response(JSON.stringify({ error: "Domain settings not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    domainToCheck = domainSettings.domain;
    dkimSelector = domainSettings.dkim_selector || "smartsend";
    orgId = domainSettings.org_id;
  }

  if (!domainToCheck) {
    return new Response(JSON.stringify({ error: "Domain is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Check DNS Records
  const spfResult = await checkSPF(domainToCheck);
  const dkimResult = await checkDKIM(domainToCheck, dkimSelector);
  const dmarcResult = await checkDMARC(domainToCheck);
  const mxResult = await checkMX(domainToCheck);
  const cnameResult = await checkCNAME(domainToCheck);

  // Update domain_settings if domain_settings_id provided
  if (domain_settings_id) {
    const { error: updateError } = await supabase
      .from("domain_settings")
      .update({
        spf_pass: spfResult.valid,
        dkim_pass: dkimResult.valid,
        dmarc_pass: dmarcResult.valid,
        mx_pass: mxResult.valid,
        last_verified_at: new Date().toISOString(),
        verification_errors: [
          ...(spfResult.error ? [{ type: "SPF", error: spfResult.error }] : []),
          ...(dkimResult.error ? [{ type: "DKIM", error: dkimResult.error }] : []),
          ...(dmarcResult.error ? [{ type: "DMARC", error: dmarcResult.error }] : []),
          ...(mxResult.error ? [{ type: "MX", error: mxResult.error }] : []),
        ],
      })
      .eq("id", domain_settings_id);

    if (updateError) {
      console.error("Error updating domain_settings:", updateError);
    }

    // Log event
    if (orgId) {
      await supabase.from("deliverability_events").insert({
        domain_settings_id,
        org_id: orgId,
        event_type: "dns_check",
        severity: spfResult.valid && dkimResult.valid ? "info" : "warning",
        message: `DNS check completed: SPF=${spfResult.valid}, DKIM=${dkimResult.valid}, DMARC=${dmarcResult.valid}`,
        event_data: {
          spf: spfResult,
          dkim: dkimResult,
          dmarc: dmarcResult,
          mx: mxResult,
          cname: cnameResult,
        },
      });
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      domain: domainToCheck,
      spf: spfResult,
      dkim: dkimResult,
      dmarc: dmarcResult,
      mx: mxResult,
      cname: cnameResult,
      all_valid: spfResult.valid && dkimResult.valid && dmarcResult.valid && mxResult.valid,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
});

// Check SPF Record
async function checkSPF(domain: string): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    const records = await Deno.resolveDns(domain, "TXT");
    if (!records || records.length === 0) {
      return { valid: false, error: "No TXT records found" };
    }

    const spfRecord = records.find((record) => {
      const txt = Array.isArray(record) ? record.join("") : String(record);
      return txt.includes("v=spf1");
    });

    if (!spfRecord) {
      return { valid: false, error: "SPF record not found" };
    }

    const txt = Array.isArray(spfRecord) ? spfRecord.join("") : String(spfRecord);
    const cleaned = txt.replace(/^"+|"+$/g, "");

    // Check if SPF includes SmartSend sending service
    const includesSmartSend = cleaned.includes("include:") || cleaned.includes("a:") || cleaned.includes("mx:");

    return {
      valid: includesSmartSend,
      record: cleaned,
      error: includesSmartSend ? undefined : "SPF record does not include sending service",
    };
  } catch (err) {
    return { valid: false, error: `DNS lookup failed: ${err.message}` };
  }
}

// Check DKIM Record
async function checkDKIM(domain: string, selector: string): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    const records = await Deno.resolveDns(dkimDomain, "TXT");
    
    if (!records || records.length === 0) {
      return { valid: false, error: `No DKIM record found for selector: ${selector}` };
    }

    const dkimRecord = records.find((record) => {
      const txt = Array.isArray(record) ? record.join("") : String(record);
      return txt.includes("v=DKIM1");
    });

    if (!dkimRecord) {
      return { valid: false, error: "DKIM record not found" };
    }

    const txt = Array.isArray(dkimRecord) ? dkimRecord.join("") : String(dkimRecord);
    const cleaned = txt.replace(/^"+|"+$/g, "");

    // Basic validation - check for public key
    const hasPublicKey = cleaned.includes("p=");

    return {
      valid: hasPublicKey,
      record: cleaned.substring(0, 100) + "...", // Truncate for response
      error: hasPublicKey ? undefined : "DKIM record missing public key",
    };
  } catch (err) {
    return { valid: false, error: `DKIM lookup failed: ${err.message}` };
  }
}

// Check DMARC Record
async function checkDMARC(domain: string): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    const dmarcDomain = `_dmarc.${domain}`;
    const records = await Deno.resolveDns(dmarcDomain, "TXT");
    
    if (!records || records.length === 0) {
      return { valid: false, error: "DMARC record not found (optional but recommended)" };
    }

    const dmarcRecord = records.find((record) => {
      const txt = Array.isArray(record) ? record.join("") : String(record);
      return txt.includes("v=DMARC1");
    });

    if (!dmarcRecord) {
      return { valid: false, error: "DMARC record not found" };
    }

    const txt = Array.isArray(dmarcRecord) ? dmarcRecord.join("") : String(dmarcRecord);
    const cleaned = txt.replace(/^"+|"+$/g, "");

    return {
      valid: true,
      record: cleaned,
    };
  } catch (err) {
    return { valid: false, error: `DMARC lookup failed: ${err.message}` };
  }
}

// Check MX Records
async function checkMX(domain: string): Promise<{ valid: boolean; records?: string[]; error?: string }> {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    
    if (!records || records.length === 0) {
      return { valid: false, error: "No MX records found" };
    }

    return {
      valid: true,
      records: records.map((r: any) => r.exchange || String(r)),
    };
  } catch (err) {
    return { valid: false, error: `MX lookup failed: ${err.message}` };
  }
}

// Check CNAME for Return-Path
async function checkCNAME(domain: string): Promise<{ valid: boolean; record?: string; error?: string }> {
  try {
    // Check for return-path CNAME (e.g., return-path.domain.com)
    const returnPathDomain = `return-path.${domain}`;
    try {
      const records = await Deno.resolveDns(returnPathDomain, "CNAME");
      if (records && records.length > 0) {
        return {
          valid: true,
          record: Array.isArray(records[0]) ? records[0].join("") : String(records[0]),
        };
      }
    } catch {
      // CNAME not found, which is optional
    }

    return { valid: false, error: "Return-path CNAME not found (optional)" };
  } catch (err) {
    return { valid: false, error: `CNAME lookup failed: ${err.message}` };
  }
}





















































