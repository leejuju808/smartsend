import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase configuration for nudge-guard");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

type IssueSeverity = "info" | "warn" | "error";

type GuardIssue = {
  rule: string;
  msg: string;
  severity: IssueSeverity;
};

type GuardCfg = {
  min_words: number;
  max_words: number;
  require_cta: boolean;
  require_unsubscribe_line: boolean;
  require_postal_address: boolean;
  forbid_phrases: string[];
  block_caps_ratio: number;
  max_links: number;
  my_meeting_link?: string | null;
  org_address?: string | null;
};

type GuardVars = Record<string, string | number | null | undefined>;

const CTA_REGEX = /(schedule|book|call|reply|calendar|meet|link)/i;
const UNSUB_REGEX = /(unsubscribe|stop receiving|opt out|no longer wish)/i;
const ADDR_HINT = /(Suite|Ste\.|Ave|Road|Blvd|Street|St\.|Drive|Dr\.|, [A-Z]{2} \d{5})/;

function wordCount(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

function capsRatio(t: string) {
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (!letters) return 0;
  const caps = (letters.match(/[A-Z]/g) || []).length;
  return caps / letters.length;
}

function linkCount(t: string) {
  return (t.match(/https?:\/\/|calendar\.|meet\.google|zoom\.us|cal\.com|hubspot\.com\/meetings/gi) || []).length;
}

function escapeRegex(source: string) {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hardFail(rule: string, msg: string): GuardIssue {
  return { rule, msg, severity: "error" };
}

function warn(rule: string, msg: string): GuardIssue {
  return { rule, msg, severity: "warn" };
}

function info(rule: string, msg: string): GuardIssue {
  return { rule, msg, severity: "info" };
}

function computeDomainAgeDays(vars: GuardVars): number | null {
  const explicitDays = vars?.sender_domain_age_days;
  if (explicitDays !== undefined && explicitDays !== null) {
    const parsed = Number(explicitDays);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const authenticatedAt = vars?.domain_authenticated_at || vars?.domainAuthenticatedAt;
  if (authenticatedAt && typeof authenticatedAt === "string") {
    const ts = Date.parse(authenticatedAt);
    if (!Number.isNaN(ts)) {
      const diffMs = Date.now() - ts;
      return diffMs / (1000 * 60 * 60 * 24);
    }
  }
  return null;
}

function autoFix(draft: string, cfg: GuardCfg, vars: GuardVars) {
  let out = draft;
  const issues: GuardIssue[] = [];

  const wc = wordCount(out);
  if (wc < cfg.min_words) issues.push(warn("TOO_SHORT", `Draft ${wc} < ${cfg.min_words}`));
  if (wc > cfg.max_words) issues.push(warn("TOO_LONG", `Draft ${wc} > ${cfg.max_words}`));

  if (cfg.require_cta && !CTA_REGEX.test(out)) {
    issues.push(warn("CTA_MISSING", "No clear call-to-action"));
    const link = typeof vars?.my_meeting_link === "string" && vars.my_meeting_link.trim().length > 0
      ? vars.my_meeting_link
      : "your link";
    out += `\n\nIf it’s helpful, here’s my calendar (${link}) to grab a quick slot.`;
  }

  const links = linkCount(out);
  if (links > cfg.max_links) issues.push(hardFail("TOO_MANY_LINKS", `Links ${links} > ${cfg.max_links}`));

  const cr = capsRatio(out);
  if (cr > cfg.block_caps_ratio) {
    issues.push(warn("HIGH_CAPS_RATIO", `CAPS ratio ${cr.toFixed(2)} > ${cfg.block_caps_ratio}`));
  }

  const lowered = out.toLowerCase();
  for (const phrase of cfg.forbid_phrases || []) {
    if (!phrase) continue;
    if (lowered.includes(phrase.toLowerCase())) {
      const safePattern = new RegExp(escapeRegex(phrase), "ig");
      out = out.replace(safePattern, "");
      issues.push(warn("FORBIDDEN_PHRASE_REMOVED", `Removed "${phrase}"`));
    }
  }

  if (cfg.require_unsubscribe_line && !UNSUB_REGEX.test(out)) {
    issues.push(warn("UNSUB_LINE_MISSING", "No unsubscribe language"));
    out += `\n\nIf you’d prefer not to hear from me, reply “unsubscribe” and I’ll remove you.`;
  }

  if (cfg.require_postal_address && !ADDR_HINT.test(out)) {
    issues.push(warn("POSTAL_ADDRESS_MISSING", "No physical mailing hint"));
    const address = typeof vars?.org_address === "string" && vars.org_address.trim().length > 0
      ? vars.org_address
      : "123 Company St, City, ST 12345";
    out += `\n${address}`;
  }

  // Deliverability hints (non-blocking)
  if (out.match(/!{2,}/)) {
    issues.push(info("EXCESSIVE_PUNCTUATION", "Detected multiple consecutive exclamation points"));
  }

  const outWordCount = wordCount(out);
  if (outWordCount > 0) {
    const pronounMatches = out.match(/\b(i|me|my|mine|myself)\b/gi) || [];
    const pronounRatio = pronounMatches.length / outWordCount;
    if (pronounRatio > 0.08) {
      issues.push(info("FIRST_PERSON_HEAVY", `First-person ratio ${(pronounRatio * 100).toFixed(1)}% > 8%`));
    }
  }

  const domainAgeDays = computeDomainAgeDays(vars);
  if (domainAgeDays !== null && domainAgeDays < 30 && links > 1) {
    issues.push(info("NEW_DOMAIN_LINK_LIMIT", `Domain age ${domainAgeDays.toFixed(1)}d; recommend <=1 link until 30d`));
  }

  return { out, issues };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { owner_id, event_id, draft, vars } = await req.json();

    if (!owner_id || typeof owner_id !== "string" || !draft || typeof draft !== "string") {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    }

    let { data: cfg, error: cfgError } = await supabase
      .from("nudge_guardrails")
      .select("*")
      .eq("owner_id", owner_id)
      .maybeSingle();

    if (cfgError) {
      console.error("nudge_guard: fetch guardrails error", cfgError);
      return new Response(JSON.stringify({ error: "Guard config lookup failed" }), {
        status: 500,
        headers: { "content-type": "application/json", ...corsHeaders },
      });
    }

    if (!cfg) {
      const { data: inserted, error: insertError } = await supabase
        .from("nudge_guardrails")
        .insert([{ owner_id }])
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("nudge_guard: guardrail insert failed", insertError);
        return new Response(JSON.stringify({ error: "Failed to seed guard config" }), {
          status: 500,
          headers: { "content-type": "application/json", ...corsHeaders },
        });
      }
      cfg = inserted;
    }

    const guardCfg = cfg as GuardCfg;
    const mergedVars: GuardVars = {
      my_meeting_link: guardCfg.my_meeting_link ?? undefined,
      org_address: guardCfg.org_address ?? undefined,
      ...(vars ?? {}),
    };

    const { out, issues } = autoFix(draft, guardCfg, mergedVars);

    if (issues.length) {
      const rows = issues.map((issue) => ({
        owner_id,
        event_id: event_id ?? null,
        severity: issue.severity,
        rule: issue.rule,
        message: issue.msg,
        draft_before: draft,
        draft_after: out,
      }));

      const { error: auditError } = await supabase.from("nudge_guard_audit").insert(rows);
      if (auditError) {
        console.error("nudge_guard: audit insert failed", auditError);
      }
    }

    const blocked = issues.some((i) => i.severity === "error");

    return new Response(JSON.stringify({ blocked, draft: out, issues }), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    console.error("nudge_guard: unexpected error", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
});


