// Domain Verification Edge Function v2
// Enhanced DNS verification for SmartSend Block 11700
// Checks SPF, DKIM, DMARC, MX records, and blacklist status

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, supabaseServiceKey);

interface VerificationResult {
  spf_pass: boolean;
  dkim_pass: boolean;
  dmarc_pass: boolean;
  mx_pass: boolean;
  is_blacklisted: boolean;
  verification_status: "unverified" | "partial" | "verified";
  errors: string[];
  dns_records: {
    spf?: string;
    dkim?: string;
    dmarc?: string;
    mx?: string[];
  };
}

// DNS resolver helper
async function resolveTxt(hostname: string): Promise<string[]> {
  try {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=TXT`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.Answer) return [];
    
    return data.Answer
      .map((record: any) => record.data)
      .filter(Boolean)
      .map((txt: string) => txt.replace(/^"|"$/g, "").trim());
  } catch (error) {
    console.error(`DNS lookup failed for ${hostname}:`, error);
    return [];
  }
}

async function resolveMx(hostname: string): Promise<string[]> {
  try {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=MX`);
    if (!response.ok) return [];
    
    const data = await response.json();
    if (!data.Answer) return [];
    
    return data.Answer
      .map((record: any) => record.data)
      .filter(Boolean);
  } catch (error) {
    console.error(`MX lookup failed for ${hostname}:`, error);
    return [];
  }
}

// Check SPF record
async function checkSPF(domain: string): Promise<{ pass: boolean; record?: string }> {
  try {
    const txtRecords = await resolveTxt(domain);
    const spfRecord = txtRecords.find((txt) => /^v=spf1/i.test(txt));
    
    if (!spfRecord) {
      return { pass: false };
    }
    
    // Check if SPF includes SmartSend or has proper structure
    const hasInclude = /include:/i.test(spfRecord);
    const hasAll = /[\s~-]all/i.test(spfRecord);
    const includesSmartSend = /include:.*smartsend/i.test(spfRecord);
    
    return {
      pass: hasInclude && hasAll,
      record: spfRecord,
    };
  } catch (error) {
    console.error(`SPF check failed for ${domain}:`, error);
    return { pass: false };
  }
}

// Check DKIM record
async function checkDKIM(domain: string, selector: string = "smartsend"): Promise<{ pass: boolean; record?: string }> {
  try {
    const dkimHost = `${selector}._domainkey.${domain}`;
    const txtRecords = await resolveTxt(dkimHost);
    const dkimRecord = txtRecords.find((txt) => /v=DKIM1/i.test(txt));
    
    if (!dkimRecord) {
      return { pass: false };
    }
    
    // Check if DKIM has public key
    const hasPublicKey = /p=[A-Za-z0-9+/=]+/i.test(dkimRecord);
    
    return {
      pass: hasPublicKey,
      record: dkimRecord,
    };
  } catch (error) {
    console.error(`DKIM check failed for ${domain}:`, error);
    return { pass: false };
  }
}

// Check DMARC record
async function checkDMARC(domain: string): Promise<{ pass: boolean; record?: string }> {
  try {
    const dmarcHost = `_dmarc.${domain}`;
    const txtRecords = await resolveTxt(dmarcHost);
    const dmarcRecord = txtRecords.find((txt) => /^v=DMARC1/i.test(txt));
    
    if (!dmarcRecord) {
      return { pass: false };
    }
    
    // DMARC exists (even with p=none is acceptable for initial setup)
    return {
      pass: true,
      record: dmarcRecord,
    };
  } catch (error) {
    console.error(`DMARC check failed for ${domain}:`, error);
    return { pass: false };
  }
}

// Check MX records
async function checkMX(domain: string): Promise<{ pass: boolean; records?: string[] }> {
  try {
    const mxRecords = await resolveMx(domain);
    
    return {
      pass: mxRecords.length > 0,
      records: mxRecords,
    };
  } catch (error) {
    console.error(`MX check failed for ${domain}:`, error);
    return { pass: false };
  }
}

// Check blacklist status (simplified - in production, use multiple blacklist APIs)
async function checkBlacklist(domain: string): Promise<boolean> {
  // In production, check multiple blacklists:
  // - Spamhaus
  // - SURBL
  // - Barracuda
  // For now, return false (not blacklisted)
  // TODO: Implement actual blacklist checks
  return false;
}

// Main verification function
async function verifyDomain(
  domain: string,
  dkimSelector: string = "smartsend"
): Promise<VerificationResult> {
  const errors: string[] = [];
  const dns_records: VerificationResult["dns_records"] = {};
  
  // Extract domain from email if needed
  const cleanDomain = domain.includes("@") 
    ? domain.split("@")[1].toLowerCase()
    : domain.toLowerCase();
  
  // Run all checks in parallel
  const [spfResult, dkimResult, dmarcResult, mxResult, isBlacklisted] = await Promise.all([
    checkSPF(cleanDomain),
    checkDKIM(cleanDomain, dkimSelector),
    checkDMARC(cleanDomain),
    checkMX(cleanDomain),
    checkBlacklist(cleanDomain),
  ]);
  
  // Collect records
  if (spfResult.record) dns_records.spf = spfResult.record;
  if (dkimResult.record) dns_records.dkim = dkimResult.record;
  if (dmarcResult.record) dns_records.dmarc = dmarcResult.record;
  if (mxResult.records) dns_records.mx = mxResult.records;
  
  // Collect errors
  if (!spfResult.pass) errors.push("SPF record missing or invalid");
  if (!dkimResult.pass) errors.push("DKIM record missing or invalid");
  if (!dmarcResult.pass) errors.push("DMARC record missing");
  if (!mxResult.pass) errors.push("MX records missing");
  if (isBlacklisted) errors.push("Domain appears on blacklist");
  
  // Determine verification status
  const checksPassed = [
    spfResult.pass,
    dkimResult.pass,
    dmarcResult.pass,
    mxResult.pass,
  ].filter(Boolean).length;
  
  let verification_status: "unverified" | "partial" | "verified";
  if (checksPassed === 4 && !isBlacklisted) {
    verification_status = "verified";
  } else if (checksPassed >= 2) {
    verification_status = "partial";
  } else {
    verification_status = "unverified";
  }
  
  return {
    spf_pass: spfResult.pass,
    dkim_pass: dkimResult.pass,
    dmarc_pass: dmarcResult.pass,
    mx_pass: mxResult.pass,
    is_blacklisted: isBlacklisted,
    verification_status,
    errors,
    dns_records,
  };
}

// Deno.serve handler
Deno.serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  
  try {
    const { domain, domain_id, dkim_selector } = await req.json();
    
    if (!domain) {
      return new Response(
        JSON.stringify({ error: "Domain is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Perform verification
    const result = await verifyDomain(domain, dkim_selector || "smartsend");
    
    // Update database if domain_id provided
    if (domain_id) {
      const { error: updateError } = await sb
        .from("domain_settings")
        .update({
          spf_pass: result.spf_pass,
          dkim_pass: result.dkim_pass,
          dmarc_pass: result.dmarc_pass,
          mx_pass: result.mx_pass,
          is_blacklisted: result.is_blacklisted,
          verification_status: result.verification_status,
          verification_errors: result.errors,
          last_verified_at: new Date().toISOString(),
        })
        .eq("id", domain_id);
      
      if (updateError) {
        console.error("Database update error:", updateError);
      }
    }
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Domain verification error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        spf_pass: false,
        dkim_pass: false,
        dmarc_pass: false,
        mx_pass: false,
        is_blacklisted: false,
        verification_status: "unverified",
        errors: [error instanceof Error ? error.message : "Unknown error"],
        dns_records: {},
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





















































