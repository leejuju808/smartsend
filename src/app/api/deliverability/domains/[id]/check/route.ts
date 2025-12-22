export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

async function doh(name: string, type: "TXT" | "CNAME") {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, { headers: { "accept": "application/dns-json" } });
  if (!res.ok) throw new Error(`DNS query failed for ${name} (${type})`);
  return res.json() as Promise<{ Answer?: Array<{ data: string }>; Status: number }>;
}

function parseTxtAnswer(ans?: Array<{ data: string }>) {
  if (!ans) return [];
  // Cloudflare wraps TXT in quotes; join segments if present.
  return ans.map(a => a.data.replace(/^"|"$/g, "").replace(/"\s+"?/g, "")).filter(Boolean);
}

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });

  const { data: dom, error: dErr } = await supabase.from("sending_domains")
    .select("id,workspace_id,domain,dkim_selector,from_email").eq("id", params.id).single();
  if (dErr || !dom || dom.workspace_id !== u.user.id)
    return NextResponse.json({ ok:false, error:"Not found" }, { status:404 });

  const domain = String(dom.domain).toLowerCase();
  const selector = dom.dkim_selector || "default";

  const details: any = { domain, selector };

  // SPF
  const spfRes = await doh(domain, "TXT").catch(e => ({ error: String(e) }));
  let spf_ok = false, spf_records: string[] = [];
  if (!("error" in spfRes)) {
    spf_records = parseTxtAnswer(spfRes.Answer);
    spf_ok = spf_records.some(v => /v=spf1/i.test(v));
  }
  details.spf = { ok: spf_ok, records: spf_records, error: (spfRes as any).error };

  // DKIM CNAME
  const dkimName = `${selector}._domainkey.${domain}`;
  const dkimRes = await doh(dkimName, "CNAME").catch(e => ({ error: String(e) }));
  const dkim_ok = !("error" in dkimRes) && Array.isArray((dkimRes as any).Answer) && (dkimRes as any).Answer.length > 0;
  details.dkim = { ok: dkim_ok, cnameTarget: dkim_ok ? (dkimRes as any).Answer[0].data : null, error: (dkimRes as any).error };

  // DMARC
  const dmarcName = `_dmarc.${domain}`;
  const dmarcRes = await doh(dmarcName, "TXT").catch(e => ({ error: String(e) }));
  let dmarc_ok = false, dmarc_warn = false, dmarc_txt: string[] = [];
  if (!("error" in dmarcRes)) {
    dmarc_txt = parseTxtAnswer(dmarcRes.Answer);
    const rec = dmarc_txt.find(v => /v=DMARC1/i.test(v));
    if (rec) {
      dmarc_ok = true;
      if (/;\s*p\s*=\s*none/i.test(rec)) dmarc_warn = true;
    }
  }
  details.dmarc = { ok: dmarc_ok, warn: dmarc_warn, records: dmarc_txt, error: (dmarcRes as any).error };

  // Overall status
  const status = (spf_ok && dkim_ok && dmarc_ok && !dmarc_warn) ? "pass"
               : (spf_ok && dkim_ok && dmarc_ok ? "warn" : "fail");

  const { error: upErr } = await supabase.from("sending_domains").update({
    last_check_at: new Date().toISOString(),
    last_check_status: status,
    last_check_details: details
  }).eq("id", dom.id);

  if (upErr) return NextResponse.json({ ok:false, error: upErr.message }, { status:500 });
  return NextResponse.json({ ok:true, status, details });
}