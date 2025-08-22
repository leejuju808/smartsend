import { promises as dns } from "node:dns";

export type CheckResult = {
  ok: boolean;
  found?: string[];
  details?: string;
  warning?: string;
  error?: string;
};

export async function checkMX(domain: string): Promise<CheckResult> {
  try {
    const mx = await dns.resolveMx(domain);
    return { ok: mx.length > 0, found: mx.map(m => `${m.exchange} (prio ${m.priority})`) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "No MX records" };
  }
}

export async function checkSPF(domain: string): Promise<CheckResult> {
  try {
    const txt = await dns.resolveTxt(domain);
    const flat = txt.map(t => t.join("")).filter(s => s.toLowerCase().includes("v=spf1"));
    if (!flat.length) return { ok: false, details: "No TXT v=spf1 found" };
    const hasAll = flat.some(s => /\s-all|\s~all|\s\?all|\s\+all/i.test(s));
    const msg = hasAll ? undefined : "Missing terminal all mechanism (~all or -all recommended)";
    return { ok: true, found: flat, warning: msg };
  } catch (e: any) {
    return { ok: false, error: e?.message || "SPF lookup failed" };
  }
}

const COMMON_DKIM_SELECTORS = [
  "default","selector1","selector2","s1","s2","k1","pm","mail","mx","sendgrid","sparkpost","mailgun","postmark","scph","mandrill"
];

export async function checkDKIM(domain: string): Promise<CheckResult> {
  const found: string[] = [];
  const hits: string[] = [];
  for (const sel of COMMON_DKIM_SELECTORS) {
    const host = `${sel}._domainkey.${domain}`;
    try {
      const txt = await dns.resolveTxt(host);
      const flat = txt.map(t => t.join(""));
      const match = flat.find(s => /v=dkim1|p=/.test(s.toLowerCase()));
      if (match) {
        hits.push(`${host} → ${truncate(match, 140)}`);
        found.push(host);
      }
    } catch {
      // ignore NXDOMAIN per selector
    }
  }
  if (hits.length) return { ok: true, found: hits, details: "At least one DKIM selector found" };
  return { ok: false, details: "No common DKIM selectors found. Verify with your ESP for exact selector name." };
}

export async function checkDMARC(domain: string): Promise<CheckResult> {
  const host = `_dmarc.${domain}`;
  try {
    const txt = await dns.resolveTxt(host);
    const flat = txt.map(t => t.join(""));
    const records = flat.filter(s => s.toLowerCase().includes("v=dmarc1"));
    if (!records.length) return { ok: false, details: "No _dmarc TXT with v=DMARC1" };
    const policy = records.find(Boolean) || "";
    const warn = /p=none/i.test(policy) ? "Policy p=none (monitoring only). Consider p=quarantine or p=reject for best results." : undefined;
    return { ok: true, found: records, warning: warn };
  } catch (e: any) {
    return { ok: false, error: e?.message || "DMARC lookup failed" };
  }
}

export function scoreDeliverability(parts: { mx: CheckResult; spf: CheckResult; dkim: CheckResult; dmarc: CheckResult; }) {
  let score = 0;
  if (parts.mx.ok) score += 15;
  if (parts.spf.ok) score += 35; else score -= 10;
  if (parts.dkim.ok) score += 35; else score -= 10;
  if (parts.dmarc.ok) score += 15; else score -= 10;
  return Math.max(0, Math.min(100, score));
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

