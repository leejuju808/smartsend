// Block 76000 — Domain DNS Verification
// Verifies DNS records for a sending domain

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveTxt(hostname: string): Promise<string[]> {
  const dns = await import("dns/promises");
  try {
    const records = await dns.resolveTxt(hostname);
    return records.map(r => r.join(""));
  } catch (error: any) {
    if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
      return [];
    }
    throw error;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get domain
    const { data: domain, error: domainError } = await supabase
      .from("sending_domains")
      .select("*")
      .eq("id", params.id)
      .single();

    if (domainError || !domain) {
      return NextResponse.json(
        { error: "Domain not found" },
        { status: 404 }
      );
    }

    let spfVerified = false;
    let dkimVerified = false;
    let dmarcVerified = false;

    // Check SPF
    try {
      const txtRecords = await resolveTxt(domain.domain);
      const spfRecord = txtRecords.find(r => 
        r.toLowerCase().includes("v=spf1")
      );
      
      if (spfRecord && domain.spf_record) {
        // Check if the record matches or includes our record
        spfVerified = spfRecord.includes(domain.spf_record.split(" ")[1]) || 
                     spfRecord.includes("_spf.smartsend.ai");
      }
    } catch (error) {
      console.error("SPF check error:", error);
    }

    // Check DKIM
    try {
      const dkimDomain = `${domain.dkim_selector || "smartsend"}._domainkey.${domain.domain}`;
      const dkimRecords = await resolveTxt(dkimDomain);
      
      if (dkimRecords.length > 0) {
        const dkimRecord = dkimRecords[0];
        dkimVerified = dkimRecord.includes("v=DKIM1");
      }
    } catch (error) {
      console.error("DKIM check error:", error);
    }

    // Check DMARC
    try {
      const dmarcDomain = `_dmarc.${domain.domain}`;
      const dmarcRecords = await resolveTxt(dmarcDomain);
      
      if (dmarcRecords.length > 0) {
        const dmarcRecord = dmarcRecords[0];
        dmarcVerified = dmarcRecord.toLowerCase().includes("v=dmarc1");
      }
    } catch (error) {
      console.error("DMARC check error:", error);
    }

    // Determine overall DNS status
    const checksPassed = [spfVerified, dkimVerified, dmarcVerified].filter(Boolean).length;
    let dnsStatus: "not_connected" | "partially_connected" | "fully_authenticated";
    
    if (checksPassed === 3) {
      dnsStatus = "fully_authenticated";
    } else if (checksPassed >= 1) {
      dnsStatus = "partially_connected";
    } else {
      dnsStatus = "not_connected";
    }

    // Update domain
    const { error: updateError } = await supabase
      .from("sending_domains")
      .update({
        spf_verified: spfVerified,
        dkim_verified: dkimVerified,
        dmarc_verified: dmarcVerified,
        dns_status: dnsStatus,
        last_dns_check_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      spf_verified: spfVerified,
      dkim_verified: dkimVerified,
      dmarc_verified: dmarcVerified,
      dns_status: dnsStatus,
    });
  } catch (error: any) {
    console.error("DNS verification error:", error);
    return NextResponse.json(
      { error: error.message || "DNS verification failed" },
      { status: 500 }
    );
  }
}



























