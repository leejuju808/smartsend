export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { checkDMARC, checkDKIM, checkMX, checkSPF, scoreDeliverability } from "@/lib/dnscheck";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const [mx, spf, dkim, dmarc] = await Promise.all([
    checkMX(domain),
    checkSPF(domain),
    checkDKIM(domain),
    checkDMARC(domain),
  ]);

  return NextResponse.json({
    domain,
    mx, spf, dkim, dmarc,
    score: scoreDeliverability({ mx, spf, dkim, dmarc }),
  });
}

import { NextResponse } from "next/server";
import { dnsTxt } from "@/server/dns";

function parseSPF(txts: string[]) {
  const spf = txts.find(t => /^v=spf1\b/i.test(t));
  if (!spf) return { found: false, record: null, issues: ["No SPF record found"] };
  const issues: string[] = [];
  if (!/(~all|-all)/.test(spf)) issues.push("SPF should end with ~all or -all");
  if (/redirect=/.test(spf) && /include=/.test(spf)) issues.push("Avoid both redirect= and include=");
  if ((spf.match(/include:/g) || []).length > 10) issues.push("Too many include: mechanisms");
  return { found: true, record: spf, issues };
}

function parseDMARC(txts: string[]) {
  const rec = txts.find(t => /^v=DMARC1;/i.test(t));
  if (!rec) return { found: false, record: null, issues: ["No DMARC record found at _dmarc."] };
  const issues: string[] = [];
  if (!/;\s*p=(none|quarantine|reject)/i.test(rec)) issues.push("Missing p= policy");
  if (/p=none/i.test(rec)) issues.push("Policy p=none (monitor only); consider quarantine/reject");
  if (!/;\s*rua=/i.test(rec)) issues.push("Add rua= for aggregate reports");
  if (!/;\s*adkim=s/i.test(rec)) issues.push("Consider adkim=s for strict alignment");
  if (!/;\s*aspf=s/i.test(rec)) issues.push("Consider aspf=s for strict alignment");
  return { found: true, record: rec, issues };
}

function parseDKIM(txts: string[]) {
  const rec = txts.find(t => /^v=DKIM1;/.test(t));
  if (!rec) return { found: false, record: null, issues: ["No DKIM record for selector"] };
  const issues: string[] = [];
  if (!/;\s*k=rsa/i.test(rec)) issues.push("k=rsa missing");
  if (!/;\s*p=/.test(rec)) issues.push("Public key p= missing");
  return { found: true, record: rec, issues };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();
  const selectorParam = (url.searchParams.get("selector") || "").trim();
  if (!domain) return NextResponse.json({ error: "Missing domain" }, { status: 400 });

  // SPF @ root
  const spfTxts = await dnsTxt(domain);
  const spf = parseSPF(spfTxts);

  // DMARC at _dmarc.domain
  const dmarcTxts = await dnsTxt(`_dmarc.${domain}`);
  const dmarc = parseDMARC(dmarcTxts);

  // DKIM @ <selector>._domainkey.domain (try common selectors if not provided)
  const selectors = selectorParam
    ? [selectorParam]
    : ["default", "selector1", "google", "mail", "s1", "k1"];

  const dkimResults: Record<string, any> = {};
  let anyDKIM = false;
  for (const sel of selectors) {
    const txts = await dnsTxt(`${sel}._domainkey.${domain}`);
    const res = parseDKIM(txts);
    dkimResults[sel] = { ...res };
    if (res.found) anyDKIM = true;
  }

  return NextResponse.json({
    domain,
    spf,
    dmarc,
    dkim: { any: anyDKIM, selectors: dkimResults }
  });
}

