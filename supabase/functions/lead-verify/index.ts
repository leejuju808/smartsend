// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMx } from "https://deno.land/x/dns/mod.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SECRET = Deno.env.get("LEAD_VERIFY_SECRET")!;

const ROLE_ACCOUNTS = new Set([
  "info", "contact", "hello", "sales", "support", "admin", "team", "marketing", "office", "billing"
]);

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "yopmail.com", "10minutemail.com", "guerrillamail.com", "trashmail.com"
]);

const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function analyze(email: string) {
  const reasons: string[] = [];
  if (!EMAIL_REGEX.test(email)) {
    reasons.push("syntax");
    return { domain: "", reasons };
  }

  const [local, domain] = email.split("@");
  if (DISPOSABLE_DOMAINS.has(domain.toLowerCase())) reasons.push("disposable");
  if (ROLE_ACCOUNTS.has(local.toLowerCase())) reasons.push("role");
  return { domain, reasons };
}

async function checkMx(domain: string) {
  try {
    const mx = await resolveMx(domain);
    const hosts = (mx ?? []).map(m => m.exchange);
    return { ok: hosts.length > 0, hosts };
  } catch {
    return { ok: false, hosts: [] as string[] };
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-ss-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const body = await req.json() as {
    campaignId: string;
    leads: Array<{ id: string; email: string }>;
  };

  const rows: any[] = [];
  for (const lead of body.leads) {
    const a = analyze(lead.email);
    let mxOK = false, mxHosts: string[] = [];
    if (a.domain && a.reasons.indexOf("syntax") === -1) {
      const mx = await checkMx(a.domain);
      mxOK = mx.ok;
      mxHosts = mx.hosts;
      if (!mxOK) a.reasons.push("mx");
    }

    let status: "valid" | "risky" | "invalid" | "unknown" = "unknown";
    if (a.reasons.includes("syntax") || a.reasons.includes("mx")) status = "invalid";
    else if (a.reasons.includes("disposable") || a.reasons.includes("role")) status = "risky";
    else status = "valid";

    rows.push({
      campaign_id: body.campaignId,
      lead_id: lead.id,
      email: lead.email,
      status,
      reasons: a.reasons,
      domain: a.domain ?? "",
      mx_hosts: mxHosts
    });
  }

  // upsert once per lead
  if (rows.length) {
    const { error } = await sb.from("lead_verifications").upsert(rows, { onConflict: "lead_id" });
    if (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  }

  // quick tallies
  const summary = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return new Response(
    JSON.stringify({ ok: true, summary, count: rows.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});

