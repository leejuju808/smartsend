import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// naive readability (Flesch-Kincaid grade-ish)
function readingGrade(text: string) {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = Math.max(1, (text.trim().match(/\b[\w'']+\b/g) || []).length);
  const syllables = Math.max(1, (text.match(/[aeiouy]+/gi) || []).length);
  // FKRA approx: 0.39*(W/S) + 11.8*(Sy/W) - 15.59
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

const SPAMMY = new Set([
  "free", "guarantee", "risk-free", "act now", "winner", "urgent", "limited time",
  "click here", "double your", "no obligation", "buy now", "lowest price", "100% free"
]);

function lint({ subject, body }: { subject: string; body: string }) {
  const issues: any[] = [];
  const metrics: any = {};

  // Subject checks
  const subj = subject || "";
  metrics.subject_len = subj.length;
  metrics.subject_excl = (subj.match(/!/g) || []).length;
  metrics.subject_caps_ratio = subj ? (subj.replace(/[^A-Z]/g, "").length / subj.replace(/[^A-Za-z]/g, "").length || 0) : 0;

  if (metrics.subject_len > 72) issues.push({ code: "SUBJECT_LEN", severity: "MEDIUM", message: "Subject is long (>72 chars).", hint: "Aim ≤ 7 words / ~45–60 chars." });
  if (metrics.subject_excl > 0) issues.push({ code: "SUBJECT_EXCL", severity: "MEDIUM", message: "Exclamation in subject.", hint: "Avoid ! in subject for deliverability." });
  if (metrics.subject_caps_ratio > 0.5) issues.push({ code: "SUBJECT_CAPS", severity: "HIGH", message: "Subject has too many capital letters.", hint: "Use normal casing." });

  // Body checks
  const bodyText = body || "";
  metrics.links = (bodyText.match(/https?:\/\/|www\./gi) || []).length;
  metrics.exclamations = (bodyText.match(/!/g) || []).length;
  metrics.uppercase_ratio = bodyText ? (bodyText.replace(/[^A-Z]/g, "").length / bodyText.replace(/[^A-Za-z]/g, "").length || 0) : 0;
  metrics.merge_tags = Array.from(bodyText.matchAll(/{{\s*[\w\.]+\s*}}/g)).map(m=>m[0]);
  metrics.reading_grade = Math.max(0, Math.round(readingGrade(bodyText) * 10) / 10);

  if (metrics.links > 3) issues.push({ code: "LINKS_MANY", severity: "MEDIUM", message: "Too many links.", hint: "Keep ≤ 2 links in cold emails." });
  if (metrics.exclamations > 2) issues.push({ code: "MANY_EXCL", severity: "MEDIUM", message: "Excessive exclamation marks.", hint: "Use calm punctuation." });
  if (metrics.uppercase_ratio > 0.4) issues.push({ code: "BODY_CAPS", severity: "HIGH", message: "Body has too many capital letters.", hint: "Reduce shouting/caps." });
  if (metrics.reading_grade > 10) issues.push({ code: "READABILITY", severity: "LOW", message: `Reading grade ≈ ${metrics.reading_grade}.`, hint: "Shorter sentences & simpler words." });

  // Spammy phrases
  const lower = (subject + " " + body).toLowerCase();
  const hits = Array.from(SPAMMY).filter(w => lower.includes(w));
  if (hits.length) issues.push({ code: "SPAM_WORDS", severity: hits.length > 2 ? "HIGH" : "MEDIUM", message: `Spammy terms: ${hits.join(", ")}`, hint: "Reword benefits w/o hype." });

  // Merge tags sanity: allow known ones; warn unknown braces
  const strayBraces = bodyText.match(/{[^}{]{0,2}}/g);
  if (strayBraces) issues.push({ code: "BROKEN_TAGS", severity: "HIGH", message: "Suspicious braces or broken merge tags.", hint: "Ensure tags look like {{first_name}}." });

  // CTA (heuristic)
  if (!/15[- ]?min|15\s*minute|quick\s*call|yes\/?no|pick a time|calendar|schedule/i.test(bodyText)) {
    issues.push({ code: "CTA_WEAK", severity: "LOW", message: "No clear low-friction CTA detected.", hint: "Offer a 15-min call or yes/no question." });
  }

  // Compute overall severity
  const sevOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  const overall = issues.reduce((m, x) => Math.max(m, sevOrder[x.severity as keyof typeof sevOrder] || 1), 1);
  const severity = overall === 3 ? "HIGH" : overall === 2 ? "MEDIUM" : "LOW";

  return { severity, issues, metrics };
}

serve(async (req) => {
  try {
    const { org_id, campaign_id, subject, body, sender_domain } = await req.json();

    // 1) Lint content
    const { severity, issues, metrics } = lint({ subject, body });

    // 2) DNS badges (from cache)
    let domainRow = null;
    if (sender_domain) {
      const { data } = await supa
        .from("sender_domain_status")
        .select("*")
        .eq("org_id", org_id)
        .eq("domain", sender_domain)
        .maybeSingle();
      domainRow = data || null;
      if (domainRow) {
        if (!domainRow.spf) issues.push({ code: "SPF_MISSING", severity: "HIGH", message: `SPF not verified for ${sender_domain}`, hint: "Add SPF TXT record at your DNS." });
        if (!domainRow.dkim) issues.push({ code: "DKIM_MISSING", severity: "HIGH", message: `DKIM not verified for ${sender_domain}`, hint: "Publish DKIM key at your DNS." });
        if (domainRow.dmarc === false || domainRow.dmarc === null) issues.push({ code: "DMARC_WEAK", severity: "MEDIUM", message: `DMARC not configured for ${sender_domain}`, hint: "Add _dmarc TXT record (p=none/quarantine/reject)." });
      }
    }

    // Recompute severity after DNS checks
    const sevOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
    const overall = issues.reduce((m, x) => Math.max(m, sevOrder[x.severity as keyof typeof sevOrder] || 1), 1);
    const finalSeverity = overall === 3 ? "HIGH" : overall === 2 ? "MEDIUM" : "LOW";

    // 3) Persist snapshot (only if campaign_id is provided)
    if (campaign_id) {
      await supa.from("campaign_preflight").insert({
        org_id, campaign_id, severity: finalSeverity, issues, metrics
      });
    }

    return new Response(JSON.stringify({ severity: finalSeverity, issues, metrics, domain: domainRow }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
});

