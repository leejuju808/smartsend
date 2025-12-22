// Block 20930 — DNS Checker API
// Checks SPF, DKIM, DMARC records for a domain

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// DNS lookup helper - uses Node.js dns module (server-side only)
async function resolveTxt(hostname: string): Promise<string[][]> {
  const dns = await import("dns/promises");
  return dns.resolveTxt(hostname);
}

interface DNSResult {
  status: "pass" | "warn" | "fail";
  record?: string;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { domain, dkim_selector = "smartsend", domain_settings_id } = body;

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 });
    }

    const results: {
      domain: string;
      spf: DNSResult;
      dkim: DNSResult;
      dmarc: DNSResult;
    } = {
      domain,
      spf: { status: "fail" },
      dkim: { status: "fail" },
      dmarc: { status: "fail" },
    };

    // Check SPF (TXT record at root domain)
    try {
      const txtRecords = await resolveTxt(domain);
      const spfRecord = txtRecords
        .map(r => r.join(""))
        .find(r => r.toLowerCase().startsWith("v=spf1"));
      
      if (spfRecord) {
        results.spf = {
          status: "pass",
          record: spfRecord,
        };
      } else {
        results.spf = {
          status: "fail",
          error: "No SPF record found",
        };
      }
    } catch (error: any) {
      results.spf = {
        status: "fail",
        error: error.message || "DNS lookup failed",
      };
    }

    // Check DKIM (TXT record at selector._domainkey.domain)
    try {
      const dkimDomain = `${dkim_selector}._domainkey.${domain}`;
      const dkimRecords = await resolveTxt(dkimDomain);
      
      if (dkimRecords.length > 0) {
        const dkimRecord = dkimRecords[0].join("");
        if (dkimRecord.includes("v=DKIM1")) {
          results.dkim = {
            status: "pass",
            record: dkimRecord,
          };
        } else {
          results.dkim = {
            status: "fail",
            error: "Invalid DKIM record format",
          };
        }
      } else {
        // Try common selectors
        const commonSelectors = ["default", "google", "selector1", "selector2", "mail"];
        let found = false;
        
        for (const selector of commonSelectors) {
          try {
            const altDkimDomain = `${selector}._domainkey.${domain}`;
            const altRecords = await resolveTxt(altDkimDomain);
            if (altRecords.length > 0) {
              const altRecord = altRecords[0].join("");
              if (altRecord.includes("v=DKIM1")) {
                results.dkim = {
                  status: "warn",
                  record: altRecord,
                  error: `DKIM found at ${selector} selector, but configured selector is ${dkim_selector}`,
                };
                found = true;
                break;
              }
            }
          } catch {
            continue;
          }
        }
        
        if (!found) {
          results.dkim = {
            status: "fail",
            error: `No DKIM record found at ${dkimDomain}`,
          };
        }
      }
    } catch (error: any) {
      results.dkim = {
        status: "fail",
        error: error.message || "DKIM lookup failed",
      };
    }

    // Check DMARC (TXT record at _dmarc.domain)
    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const dmarcRecords = await resolveTxt(dmarcDomain);
      
      if (dmarcRecords.length > 0) {
        const dmarcRecord = dmarcRecords[0].join("");
        if (dmarcRecord.toLowerCase().startsWith("v=dmarc1")) {
          // Check if policy is "none" (warning)
          if (dmarcRecord.toLowerCase().includes("p=none")) {
            results.dmarc = {
              status: "warn",
              record: dmarcRecord,
              error: "DMARC policy is set to 'none'. Consider upgrading to 'quarantine' or 'reject'",
            };
          } else {
            results.dmarc = {
              status: "pass",
              record: dmarcRecord,
            };
          }
        } else {
          results.dmarc = {
            status: "fail",
            error: "Invalid DMARC record format",
          };
        }
      } else {
        results.dmarc = {
          status: "fail",
          error: "No DMARC record found",
        };
      }
    } catch (error: any) {
      results.dmarc = {
        status: "fail",
        error: error.message || "DMARC lookup failed",
      };
    }

    // Update domain_settings if domain_settings_id provided
    if (domain_settings_id) {
      const spfPass = results.spf.status === "pass";
      const dkimPass = results.dkim.status === "pass" || results.dkim.status === "warn";
      const dmarcPass = results.dmarc.status === "pass" || results.dmarc.status === "warn";

      await supabase
        .from("domain_settings")
        .update({
          spf_pass: spfPass,
          dkim_pass: dkimPass,
          dmarc_pass: dmarcPass,
          spf_status: results.spf.status,
          dkim_status: results.dkim.status,
          dmarc_status: results.dmarc.status,
          spf_record: results.spf.record || null,
          dkim_record: results.dkim.record || null,
          dmarc_record: results.dmarc.record || null,
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", domain_settings_id);

      // Log DNS check event
      const { data: domainSettings } = await supabase
        .from("domain_settings")
        .select("org_id")
        .eq("id", domain_settings_id)
        .single();

      if (domainSettings) {
        await supabase.from("deliverability_events").insert({
          domain_settings_id,
          org_id: domainSettings.org_id,
          event_type: "dns_check",
          severity: spfPass && dkimPass && dmarcPass ? "info" : "warning",
          message: `DNS check completed: SPF=${results.spf.status}, DKIM=${results.dkim.status}, DMARC=${results.dmarc.status}`,
          event_data: results,
        });
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
    });
  } catch (error: any) {
    console.error("DNS check error:", error);
    return NextResponse.json(
      { error: error.message || "DNS check failed" },
      { status: 500 }
    );
  }
}

