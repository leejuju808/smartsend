// supabase/functions/scan-domain/index.ts
// Block 413 — Domain Health Scanner v1

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function dnsTXT(domain: string) {
  try {
    const records = await Deno.resolveDns(domain, "TXT");
    // Each TXT record is an array of strings (can be split across multiple strings)
    // Join each record array into a single string
    return records.map((r) => (Array.isArray(r) ? r.join("") : String(r)));
  } catch {
    return [];
  }
}

async function dnsMX(domain: string) {
  try {
    const records = await Deno.resolveDns(domain, "MX");
    return records.map((r) => ({
      exchange: r.exchange,
      priority: r.priority,
    }));
  } catch {
    return [];
  }
}

async function lookupWHOIS(domain: string) {
  try {
    const apiKey = Deno.env.get("WHOIS_API_KEY");
    if (!apiKey) {
      console.warn("WHOIS_API_KEY not set, skipping domain age lookup");
      return null;
    }

    const resp = await fetch(
      `https://api.whoisfreaks.com/v1.0/whois?apiKey=${apiKey}&domainName=${domain}&outputFormat=JSON`
    );
    
    if (!resp.ok) {
      console.warn(`WHOIS API error: ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    const createdAt = data?.domainCreatedDate;
    return createdAt ? new Date(createdAt) : null;
  } catch (err) {
    console.warn("WHOIS lookup failed:", err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { domain } = body;

  if (!domain || typeof domain !== "string") {
    return new Response(JSON.stringify({ error: "Domain is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Normalize domain (remove protocol, www, etc.)
  const normalizedDomain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase()
    .trim();

  try {
    // 1. Fetch SPF
    const txt = await dnsTXT(normalizedDomain);
    const spfRec = txt.find((t: string) => t.includes("v=spf1"));
    const spfValid = Boolean(spfRec);

    // 2. DKIM: attempt common selectors
    const selectors = ["default", "google", "mail", "selector1", "s1"];
    let dkimRecord = null;
    let dkimSelector = null;

    for (const sel of selectors) {
      const candidate = `${sel}._domainkey.${normalizedDomain}`;
      const recs = await dnsTXT(candidate);
      if (recs && recs.length > 0) {
        const fullRecord = recs.join("");
        if (fullRecord.includes("v=DKIM1") || fullRecord.includes("v=DKIM")) {
          dkimRecord = fullRecord;
          dkimSelector = sel;
          break;
        }
      }
    }

    const dkimValid = Boolean(dkimRecord && (dkimRecord.includes("v=DKIM1") || dkimRecord.includes("v=DKIM")));

    // 3. DMARC
    const dmarcRec = await dnsTXT(`_dmarc.${normalizedDomain}`);
    const dmarcTxt = dmarcRec.find((t: string) => t.includes("v=DMARC1"));
    let dmarcPolicy = "none";

    if (dmarcTxt) {
      const match = dmarcTxt.match(/p=(\w+)/);
      if (match) dmarcPolicy = match[1];
    }

    const dmarcValid = Boolean(dmarcTxt);

    // 4. MX
    const mx = await dnsMX(normalizedDomain);
    const mxValid = mx.length > 0;

    // 5. Domain age
    const createdAt = await lookupWHOIS(normalizedDomain);
    let domainAgeDays = null;
    if (createdAt) {
      domainAgeDays = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    // 6. Reputation scoring v1
    let reputation = 50;

    if (spfValid) reputation += 10;
    if (dkimValid) reputation += 10;
    if (dmarcValid) reputation += 10;
    if (dmarcPolicy === "reject") reputation += 10;
    if (domainAgeDays && domainAgeDays > 90) reputation += 10;
    if (!mxValid) reputation -= 20;

    // clamp
    reputation = Math.min(100, Math.max(0, reputation));

    // Save to DB
    const { data, error } = await client
      .from("domain_health")
      .upsert({
        domain: normalizedDomain,
        spf_record: spfRec ?? null,
        spf_valid: spfValid,
        dkim_record: dkimRecord ?? null,
        dkim_selector: dkimSelector,
        dkim_valid: dkimValid,
        dmarc_record: dmarcTxt ?? null,
        dmarc_policy: dmarcPolicy,
        dmarc_valid: dmarcValid,
        mx_records: mx ?? [],
        mx_valid: mxValid,
        domain_age_days: domainAgeDays,
        reputation_score: reputation,
        last_scanned_at: new Date().toISOString(),
      }, {
        onConflict: "domain",
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ result: data, error: null }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Scan error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

