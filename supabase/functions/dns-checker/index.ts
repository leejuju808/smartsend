// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TxtResponse = {
  Answer?: Array<{ data?: string }>;
  answers?: Array<{ data?: string }>;
  records?: string[];
  result?: { Answer?: Array<{ data?: string }> };
  [key: string]: unknown;
};

function normalizeTxt(records: string[]): string[] {
  return records
    .map((txt) => txt.replace(/^"+|"+$/g, "").trim())
    .filter((txt) => txt.length > 0);
}

async function fetchTxt(host: string, provided?: string[]): Promise<string[]> {
  if (!host) return [];
  if (provided?.length) return normalizeTxt(provided);

  const resolver = Deno.env.get("DNS_RESOLVER_URL") ?? "";
  if (!resolver) return [];

  const target = resolver.includes("{host}")
    ? resolver.replace("{host}", encodeURIComponent(host))
    : `${resolver}${resolver.includes("?") ? "&" : "?"}name=${encodeURIComponent(host)}&type=TXT`;

  try {
    const resp = await fetch(target);
    if (!resp.ok) return [];
    const data = (await resp.json()) as TxtResponse;
    const answers =
      (Array.isArray(data.Answer) ? data.Answer : undefined) ??
      (Array.isArray(data.answers) ? data.answers : undefined) ??
      (Array.isArray(data.result?.Answer) ? data.result.Answer : undefined);
    if (answers) {
      return normalizeTxt(
        answers
          .map((a) => (typeof a === "object" && a ? String(a.data ?? "") : ""))
          .filter(Boolean),
      );
    }
    if (Array.isArray(data.records)) {
      return normalizeTxt(data.records.map((item) => String(item)));
    }
    return [];
  } catch (_err) {
    return [];
  }
}

function parseSPF(txts: string[]) {
  const spf = txts.find((t) => /^v=spf1\b/i.test(t)) ?? "";
  const pass = /include:|ip4:|ip6:/i.test(spf) && /\s-all|\s~all/i.test(spf);
  return { pass, record: spf };
}

function parseDMARC(txts: string[]) {
  const dmarc = txts.find((t) => /^v=DMARC1\b/i.test(t)) ?? "";
  const pass = /p=(reject|quarantine)/i.test(dmarc);
  return { pass, record: dmarc };
}

function parseDKIM(txts: string[]) {
  const record = txts.find((t) => /v=DKIM1;/i.test(t)) ?? "";
  const pass = record.length > 0;
  return { pass, record };
}

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

  const client = createClient(supabaseUrl, serviceKey, {
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

  const {
    domainId,
    domain,
    dkimSelector,
    spfRecords,
    dkimRecords,
    dmarcRecords,
  }: {
    domainId?: string;
    domain?: string;
    dkimSelector?: string;
    spfRecords?: string[];
    dkimRecords?: string[];
    dmarcRecords?: string[];
  } = payload ?? {};

  if (!domain) {
    return new Response(JSON.stringify({ error: "Domain is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const spfTxt = await fetchTxt(domain, spfRecords);
  const dmarcTxt = await fetchTxt(`_dmarc.${domain}`, dmarcRecords);
  const dkimHost = dkimSelector ? `${dkimSelector}._domainkey.${domain}` : "";
  const dkimTxt = dkimHost ? await fetchTxt(dkimHost, dkimRecords) : [];

  const spf = parseSPF(spfTxt);
  const dmarc = parseDMARC(dmarcTxt);
  const dkim = parseDKIM(dkimTxt);

  const ok = spf.pass && dkim.pass && dmarc.pass;
  const advice = [
    spf.pass ? null : "Add or update SPF (v=spf1 ... -all).",
    dkim.pass ? null : "Publish a DKIM TXT record at <selector>._domainkey with v=DKIM1; p=...",
    dmarc.pass ? null : "Configure DMARC with p=quarantine or p=reject.",
  ]
    .filter(Boolean)
    .join(" ");

  if (domainId) {
    const upsertResult = await client.from("domain_dns_status").upsert({
      domain_id: domainId,
      checked_at: new Date().toISOString(),
      spf_pass: spf.pass,
      dkim_pass: dkim.pass,
      dmarc_pass: dmarc.pass,
      spf_record: spf.record,
      dkim_selector: dkimSelector ?? null,
      dkim_record: dkim.record,
      dmarc_record: dmarc.record,
      advice: advice || null,
    });

    if (upsertResult.error) {
      return new Response(JSON.stringify({ error: upsertResult.error.message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const activateResult = await client
      .from("sending_domains")
      .update({ is_active: ok })
      .eq("id", domainId);

    if (activateResult.error) {
      return new Response(JSON.stringify({ error: activateResult.error.message }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok, spf, dkim, dmarc, advice }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});




