import { NextRequest, NextResponse } from "next/server";
import { promises as dns } from "dns";
import { createClient } from "@supabase/supabase-js";
import { getSubscriptionStatus } from "@/lib/subscription";

type Check = { ok: boolean; found?: string[]; want?: string; help?: string };

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function hasAll(parts: string[], s: string) { 
  return parts.every(p => s.includes(p)); 
}

async function getTXT(name: string) {
  try { 
    const rows = await dns.resolveTxt(name); 
    return rows.map(r => r.join("")); 
  } catch { 
    return []; 
  }
}

async function getCNAME(name: string) {
  try { 
    return [await dns.resolveCname(name)].flat(); 
  } catch { 
    return []; 
  }
}

function brevoDefaults(domain: string, selector: string) {
  return {
    spfWanted: `v=spf1 include:spf.brevo.com ~all`,
    dkimName: `${selector}._domainkey.${domain}`,
    dkimWantedParts: [`v=DKIM1`, `k=rsa`], // value from Brevo UI (user pastes)
    dmarcName: `_dmarc.${domain}`,
    dmarcWanted: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`,
    trackHost: `t.${domain}`, 
    trackTargetHint: `uXXXXX.wl.sendgrid.net or brevo tracking target`
  };
}

function mailersendDefaults(domain: string, selector: string) {
  return {
    spfWanted: `v=spf1 include:_spf.mailersend.net ~all`,
    dkimName: `${selector}._domainkey.${domain}`,
    dkimWantedParts: [`v=DKIM1`, `k=rsa`],
    dmarcName: `_dmarc.${domain}`,
    dmarcWanted: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`,
    trackHost: `t.${domain}`, 
    trackTargetHint: `track.mailersend.net`
  };
}

export async function POST(req: NextRequest) {
  // Check authentication
  const { userId } = await getSubscriptionStatus();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { domain, provider = "brevo", selector = "mail", trackSub = "t", dkimValueSample } = body || {};
  
  if (!domain) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }

  const defs = provider === "mailersend" ? mailersendDefaults(domain, selector) : brevoDefaults(domain, selector);
  const results: Record<string, Check> = {} as any;

  // SPF
  const spfTxt = await getTXT(domain);
  const spf = spfTxt.find(s => s.startsWith("v=spf1"));
  results.spf = {
    ok: !!spf && (provider === "mailersend" ? spf.includes("_spf.mailersend.net") : spf.includes("spf.brevo.com")),
    found: spfTxt,
    want: defs.spfWanted,
    help: `Create/Update TXT at ${domain} to include your ESP include record.`
  };

  // DKIM
  const dkimName = defs.dkimName;
  const dkimTxt = await getTXT(dkimName);
  let dkimOk = false;
  if (dkimTxt.length) {
    // If user supplied a sample DKIM value (from provider UI), check key parts
    if (dkimValueSample) {
      dkimOk = dkimTxt.some(s => s.replace(/\s+/g, "").includes(dkimValueSample.replace(/\s+/g, "")));
    } else {
      dkimOk = dkimTxt.some(s => hasAll(defs.dkimWantedParts, s));
    }
  }
  results.dkim = {
    ok: dkimOk,
    found: dkimTxt,
    want: dkimValueSample || "(paste your provider's DKIM value)",
    help: `Create TXT at ${dkimName} with your provider DKIM value.`
  };

  // DMARC
  const dmarcTxt = await getTXT(defs.dmarcName);
  const dmarc = dmarcTxt.find(s => s.startsWith("v=DMARC1"));
  results.dmarc = {
    ok: !!dmarc,
    found: dmarcTxt,
    want: defs.dmarcWanted,
    help: `Create TXT at ${defs.dmarcName} (start with p=quarantine; upgrade to p=reject after warmup).`
  };

  // Tracking CNAME
  const trackHost = `${trackSub}.${domain}`;
  const cname = await getCNAME(trackHost);
  results.tracking = {
    ok: cname.length > 0,
    found: cname,
    want: defs.trackTargetHint,
    help: `Create CNAME ${trackHost} → provider's tracking host (see ${provider} docs).`
  };

  const verified = results.spf.ok && results.dkim.ok && results.dmarc.ok && results.tracking.ok;
  
  // Store results in database
  const { error } = await sb.from("sender_domains")
    .upsert({ 
      domain, 
      provider, 
      dkim_selector: selector, 
      tracking_subdomain: trackSub, 
      verified, 
      last_check: results 
    }, { 
      onConflict: "domain" 
    });
    
  if (error) {
    console.error("Error saving domain check results:", error);
  }

  return NextResponse.json({ 
    domain, 
    provider, 
    selector, 
    results, 
    verified 
  });
} 