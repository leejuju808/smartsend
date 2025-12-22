// DNS Scanner Edge Function
// Comprehensive DNS validation for SPF, DKIM, DMARC, MX, A, PTR, BIMI

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

interface DNSResult {
  valid: boolean;
  record?: string;
  records?: string[];
  issues: string[];
  selector?: string;
  policy?: string;
}

interface DNSScanResult {
  spf: DNSResult;
  dkim: DNSResult;
  dmarc: DNSResult;
  mx: DNSResult;
  a: DNSResult;
  ptr: DNSResult;
  bimi: DNSResult;
}

// DNS lookup helper
async function lookupDNS(hostname: string, type: "TXT" | "MX" | "A" | "PTR"): Promise<string[]> {
  try {
    if (type === "TXT") {
      const records = await Deno.resolveDns(hostname, "TXT");
      return records.map((r: any) => {
        if (Array.isArray(r)) {
          return r.join("");
        }
        return String(r).replace(/^"+|"+$/g, "").trim();
      });
    } else if (type === "MX") {
      const records = await Deno.resolveDns(hostname, "MX");
      return records.map((r: any) => {
        if (typeof r === "object" && r.exchange) {
          return r.exchange;
        }
        return String(r);
      });
    } else if (type === "A") {
      const records = await Deno.resolveDns(hostname, "A");
      return records.map((r: any) => String(r));
    } else if (type === "PTR") {
      // PTR requires reverse lookup - we'll need IP first
      // This is a simplified version
      try {
        const aRecords = await Deno.resolveDns(hostname, "A");
        if (aRecords.length > 0) {
          const ip = String(aRecords[0]);
          const parts = ip.split(".").reverse();
          const ptrHost = `${parts.join(".")}.in-addr.arpa`;
          const ptrRecords = await Deno.resolveDns(ptrHost, "PTR");
          return ptrRecords.map((r: any) => String(r));
        }
      } catch {
        // Ignore PTR errors
      }
      return [];
    }
    return [];
  } catch (error) {
    console.error(`DNS lookup failed for ${hostname} (${type}):`, error);
    return [];
  }
}

// SPF Check
async function checkSPF(domain: string): Promise<DNSResult> {
  const issues: string[] = [];
  const txtRecords = await lookupDNS(domain, "TXT");
  const spfRecord = txtRecords.find((t) => /^v=spf1\b/i.test(t)) || "";

  if (!spfRecord) {
    issues.push("SPF record not found");
    return { valid: false, issues };
  }

  // Check for multiple SPF records
  const spfRecords = txtRecords.filter((t) => /^v=spf1\b/i.test(t));
  if (spfRecords.length > 1) {
    issues.push("Multiple SPF records detected (only one allowed)");
  }

  // Check for softfail (~all)
  if (/\s~all\b/i.test(spfRecord)) {
    issues.push("SPF uses softfail (~all), consider using -all for better security");
  }

  // Check for too many lookups
  const includes = (spfRecord.match(/include:/gi) || []).length;
  if (includes > 10) {
    issues.push(`SPF includes too many lookups (${includes}), may exceed DNS lookup limit`);
  }

  // Check if record is valid
  const isValid = /include:|ip4:|ip6:|mx|a|redirect:/i.test(spfRecord) &&
    /\s(-all|~all|\?all)\b/i.test(spfRecord);

  return {
    valid: isValid,
    record: spfRecord,
    issues,
  };
}

// DKIM Check
async function checkDKIM(domain: string, selector?: string): Promise<DNSResult> {
  const issues: string[] = [];
  const selectors = selector ? [selector] : ["default", "google", "mail", "selector1", "s1", "dkim"];

  for (const sel of selectors) {
    const dkimHost = `${sel}._domainkey.${domain}`;
    const txtRecords = await lookupDNS(dkimHost, "TXT");
    const dkimRecord = txtRecords.find((t) => /v=DKIM1;/i.test(t) || /v=DKIM;/i.test(t)) || "";

    if (dkimRecord) {
      // Validate key format
      if (!/p=[A-Za-z0-9+/=]+/i.test(dkimRecord)) {
        issues.push(`DKIM key format may be invalid for selector ${sel}`);
      }

      return {
        valid: true,
        record: dkimRecord,
        selector: sel,
        issues,
      };
    }
  }

  issues.push("DKIM record not found for any common selector");
  return {
    valid: false,
    issues,
  };
}

// DMARC Check
async function checkDMARC(domain: string): Promise<DNSResult> {
  const issues: string[] = [];
  const dmarcHost = `_dmarc.${domain}`;
  const txtRecords = await lookupDNS(dmarcHost, "TXT");
  const dmarcRecord = txtRecords.find((t) => /^v=DMARC1\b/i.test(t)) || "";

  if (!dmarcRecord) {
    issues.push("DMARC record not found");
    return { valid: false, issues };
  }

  // Extract policy
  const policyMatch = dmarcRecord.match(/p=([^;]+)/i);
  const policy = policyMatch ? policyMatch[1].toLowerCase() : "none";

  // Check aggregate reports
  const hasAggregate = /rua=/i.test(dmarcRecord);

  if (policy === "none") {
    issues.push("DMARC policy is 'none', upgrade to 'quarantine' or 'reject' for better security");
  }

  if (!hasAggregate) {
    issues.push("DMARC aggregate reports (rua) not configured");
  }

  return {
    valid: true,
    record: dmarcRecord,
    policy,
    issues,
  };
}

// MX Check
async function checkMX(domain: string): Promise<DNSResult> {
  const issues: string[] = [];
  const mxRecords = await lookupDNS(domain, "MX");

  if (mxRecords.length === 0) {
    issues.push("No MX records found");
    return { valid: false, records: [], issues };
  }

  // Check for common mail server patterns
  const suspiciousPatterns = /(spam|block|blacklist)/i;
  const hasSuspicious = mxRecords.some((mx) => suspiciousPatterns.test(mx));
  if (hasSuspicious) {
    issues.push("Some MX records contain suspicious patterns");
  }

  return {
    valid: true,
    records: mxRecords,
    issues,
  };
}

// A Record Check
async function checkA(domain: string): Promise<DNSResult> {
  const issues: string[] = [];
  const aRecords = await lookupDNS(domain, "A");

  if (aRecords.length === 0) {
    issues.push("No A records found");
    return { valid: false, records: [], issues };
  }

  return {
    valid: true,
    records: aRecords,
    issues,
  };
}

// PTR (Reverse DNS) Check
async function checkPTR(domain: string): Promise<DNSResult> {
  const issues: string[] = [];
  
  try {
    // Get A record first
    const aRecords = await lookupDNS(domain, "A");
    if (aRecords.length === 0) {
      issues.push("Cannot check PTR: No A records found");
      return { valid: false, issues };
    }

    const ip = aRecords[0];
    const parts = ip.split(".").reverse();
    const ptrHost = `${parts.join(".")}.in-addr.arpa`;
    const ptrRecords = await lookupDNS(ptrHost, "PTR");

    if (ptrRecords.length === 0) {
      issues.push("PTR (reverse DNS) record not found");
      return { valid: false, issues };
    }

    // Check if PTR matches domain
    const ptrRecord = ptrRecords[0].toLowerCase();
    const domainLower = domain.toLowerCase();
    if (!ptrRecord.includes(domainLower)) {
      issues.push(`PTR record (${ptrRecord}) does not match domain (${domain})`);
    }

    return {
      valid: true,
      record: ptrRecords[0],
      issues,
    };
  } catch (error) {
    issues.push(`PTR check failed: ${error.message}`);
    return { valid: false, issues };
  }
}

// BIMI Check
async function checkBIMI(domain: string): Promise<DNSResult> {
  const issues: string[] = [];
  const bimiHost = `default._bimi.${domain}`;
  const txtRecords = await lookupDNS(bimiHost, "TXT");
  const bimiRecord = txtRecords.find((t) => /v=BIMI1/i.test(t)) || "";

  if (!bimiRecord) {
    issues.push("BIMI record not found (optional but recommended)");
    return { valid: false, issues };
  }

  return {
    valid: true,
    record: bimiRecord,
    issues,
  };
}

// Main scan function
async function scanDNS(domain: string, dkimSelector?: string): Promise<DNSScanResult> {
  const [spf, dkim, dmarc, mx, a, ptr, bimi] = await Promise.all([
    checkSPF(domain),
    checkDKIM(domain, dkimSelector),
    checkDMARC(domain),
    checkMX(domain),
    checkA(domain),
    checkPTR(domain),
    checkBIMI(domain),
  ]);

  return { spf, dkim, dmarc, mx, a, ptr, bimi };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { inbox_id, domain, dkim_selector } = await req.json();

    if (!inbox_id && !domain) {
      return new Response(
        JSON.stringify({ error: "inbox_id or domain is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let targetDomain = domain;
    let inboxId = inbox_id;
    let workspaceId: string | null = null;

    // If inbox_id provided, fetch domain and workspace
    if (inbox_id && !domain) {
      const { data: inbox, error: inboxError } = await supabase
        .from("sender_inboxes")
        .select("email, domain_id, workspace_id, sender_domains!inner(domain)")
        .eq("id", inbox_id)
        .single();

      if (inboxError || !inbox) {
        return new Response(
          JSON.stringify({ error: "Inbox not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      targetDomain = inbox.sender_domains?.domain;
      workspaceId = inbox.workspace_id;
    }

    if (!targetDomain) {
      return new Response(
        JSON.stringify({ error: "Domain not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize domain
    const normalizedDomain = targetDomain.toLowerCase().trim().split("/")[0];

    // Perform DNS scan
    const scanResult = await scanDNS(normalizedDomain, dkim_selector);

    // If inbox_id provided, save results to database
    if (inboxId && workspaceId) {
      const issues: string[] = [];
      if (!scanResult.spf.valid) issues.push(...scanResult.spf.issues);
      if (!scanResult.dkim.valid) issues.push(...scanResult.dkim.issues);
      if (!scanResult.dmarc.valid) issues.push(...scanResult.dmarc.issues);
      if (!scanResult.mx.valid) issues.push(...scanResult.mx.issues);

      // Upsert inbox inspector report
      const { error: upsertError } = await supabase
        .from("inbox_inspector_reports")
        .upsert({
          inbox_id: inboxId,
          workspace_id: workspaceId,
          dns_spf_valid: scanResult.spf.valid,
          dns_spf_record: scanResult.spf.record,
          dns_spf_issues: scanResult.spf.issues,
          dns_dkim_valid: scanResult.dkim.valid,
          dns_dkim_selector: scanResult.dkim.selector,
          dns_dkim_record: scanResult.dkim.record,
          dns_dkim_issues: scanResult.dkim.issues,
          dns_dmarc_valid: scanResult.dmarc.valid,
          dns_dmarc_policy: scanResult.dmarc.policy,
          dns_dmarc_record: scanResult.dmarc.record,
          dns_dmarc_aggregate_reports: scanResult.dmarc.record?.includes("rua=") || false,
          dns_dmarc_issues: scanResult.dmarc.issues,
          dns_mx_valid: scanResult.mx.valid,
          dns_mx_records: scanResult.mx.records,
          dns_mx_issues: scanResult.mx.issues,
          dns_a_valid: scanResult.a.valid,
          dns_a_records: scanResult.a.records,
          dns_ptr_valid: scanResult.ptr.valid,
          dns_ptr_record: scanResult.ptr.record,
          dns_bimi_exists: scanResult.bimi.valid,
          dns_bimi_record: scanResult.bimi.record,
          checked_at: new Date().toISOString(),
          next_check_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        }, {
          onConflict: "inbox_id",
        });

      if (upsertError) {
        console.error("Error upserting inspector report:", upsertError);
      }
    }

    return new Response(
      JSON.stringify({
        domain: normalizedDomain,
        scan: scanResult,
        checked_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error scanning DNS:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});



