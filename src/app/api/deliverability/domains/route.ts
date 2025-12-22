// Block 76000 — Deliverability API
// Domain management endpoints

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Generate DNS records for a domain
function generateDNSRecords(domain: string) {
  // Generate DKIM key (in production, use a proper key generation library)
  const dkimPublicKey = `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...`; // Placeholder
  
  const dkimSelector = "smartsend";
  const dkimRecord = `v=DKIM1; k=rsa; p=${dkimPublicKey}`;
  
  // SPF record - allow SmartSend sending servers
  const spfRecord = `v=spf1 include:_spf.smartsend.ai ~all`;
  
  // DMARC record - start with monitoring, then upgrade to quarantine/reject
  const dmarcRecord = `v=DMARC1; p=none; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; fo=1`;
  
  return {
    spf: {
      type: "TXT",
      host: "@",
      value: spfRecord,
      ttl: 3600,
    },
    dkim: {
      type: "TXT",
      host: `${dkimSelector}._domainkey`,
      value: dkimRecord,
      ttl: 3600,
    },
    dmarc: {
      type: "TXT",
      host: "_dmarc",
      value: dmarcRecord,
      ttl: 3600,
    },
  };
}

// GET /api/deliverability/domains - List domains for org
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");

    if (!orgId) {
      return NextResponse.json({ error: "org_id is required" }, { status: 400 });
    }

    const { data: domains, error } = await supabase
      .from("sending_domains")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ domains });
  } catch (error: any) {
    console.error("Error fetching domains:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch domains" },
      { status: 500 }
    );
  }
}

// POST /api/deliverability/domains - Add new domain
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { domain, org_id, roofing_company_id } = body;

    if (!domain || !org_id) {
      return NextResponse.json(
        { error: "domain and org_id are required" },
        { status: 400 }
      );
    }

    // Normalize domain (remove protocol, www, etc.)
    const normalizedDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .toLowerCase()
      .trim();

    // Generate DNS records
    const dnsRecords = generateDNSRecords(normalizedDomain);

    // Insert domain
    const { data: newDomain, error } = await supabase
      .from("sending_domains")
      .insert({
        org_id,
        roofing_company_id: roofing_company_id || null,
        domain: normalizedDomain,
        dkim_record: dnsRecords.dkim.value,
        dkim_selector: "smartsend",
        spf_record: dnsRecords.spf.value,
        dmarc_record: dnsRecords.dmarc.value,
        dns_status: "not_connected",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      domain: newDomain,
      dns_records: dnsRecords,
    });
  } catch (error: any) {
    console.error("Error adding domain:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add domain" },
      { status: 500 }
    );
  }
}
