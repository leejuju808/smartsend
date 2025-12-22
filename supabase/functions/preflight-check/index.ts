import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const SPAM = [
  "100% free", "act now", "risk-free", "lowest price", "as seen on", "winner", "guaranteed",
  "click here", "unsubscribe now", "viagra", "loan", "casino", "make money", "urgent response"
];

type Payload = {
  account_id: string;
  campaign_id?: string | null;
  message_id?: string;
  from_email: string;
  to_email: string;
  subject: string;
  html?: string;
  text?: string;
};

type Check = {
  key: string;
  severity: "ok" | "warn" | "fail";
  ok: boolean;
  msg: string;
  meta?: Record<string, unknown>;
};

function isUrl(str: string) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function extractUrls(text: string) {
  const rx = /\bhttps?:\/\/[^\s)>"']+/gi;
  return (text.match(rx) || []).filter((u) => {
    if (u.length > 2048) return false;
    return isUrl(u);
  }).slice(0, 50);
}

function percentCaps(s: string) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters) return 0;
  const caps = (letters.match(/[A-Z]/g) || []).length;
  return Math.round((caps / letters.length) * 100);
}

function unresolvedTokens(s: string) {
  return s.match(/\{\{[^}]+}}/g) || [];
}

function emojiCount(s: string) {
  return (s.match(/\p{Emoji_Presentation}/gu) || []).length;
}

function ratioImageToText(htmlOrText: string) {
  const img = (htmlOrText.match(/<img\b/gi) || []).length;
  const words = htmlOrText.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  if (words === 0 && img > 0) return 1;
  return Math.min(1, img / Math.max(1, words / 100));
}

async function domainAuth(domain: string | undefined) {
  if (!domain) {
    return { spf_ok: false, dkim_ok: false, dmarc_ok: false };
  }
  const { data } = await supabase
    .from("domain_auth")
    .select("*")
    .eq("domain", domain.toLowerCase())
    .maybeSingle();
  return data ?? { spf_ok: false, dkim_ok: false, dmarc_ok: false };
}

async function domainSuppressed(
  domain: string | undefined,
  accountId?: string | null,
  campaignId?: string | null
) {
  if (!domain) return false;
  const { data, error } = await supabase.rpc("domain_is_suppressed", {
    p_domain: domain.toLowerCase(),
    p_account: accountId ?? null,
    p_campaign: campaignId ?? null,
  });
  if (error) {
    throw error;
  }
  return !!data;
}

async function canSendNow(account_id: string, n: number) {
  const { data } = await supabase.rpc("can_send", { p_account: account_id, p_n: n });
  return !!data;
}

function sanitizeBodyPreview(p: Payload) {
  const source = p.text ?? p.html ?? "";
  return source.slice(0, 240);
}

function summarizeSeverity(checks: Check[]) {
  const hasFail = checks.some((c) => c.severity === "fail" && !c.ok);
  if (hasFail) return "fail";
  const hasWarn = checks.some((c) => c.severity === "warn" && !c.ok);
  return hasWarn ? "warn" : "ok";
}

function failingKeys(checks: Check[]) {
  return checks.filter((c) => !c.ok).map((c) => c.key);
}

function normalizeString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function normalizePayload(raw: Payload): Payload {
  return {
    account_id: raw.account_id,
    campaign_id: typeof raw.campaign_id === "string" ? raw.campaign_id : undefined,
    message_id: raw.message_id,
    from_email: normalizeString(raw.from_email).trim(),
    to_email: normalizeString(raw.to_email).trim(),
    subject: normalizeString(raw.subject),
    html: normalizeString(raw.html),
    text: normalizeString(raw.text)
  };
}

async function computeChecks(payload: Payload) {
  const checks: Check[] = [];
  const body = payload.html || payload.text || "";
  const domFrom = payload.from_email.split("@")[1]?.toLowerCase();
  const domTo = payload.to_email.split("@")[1]?.toLowerCase();

  const auth = await domainAuth(domFrom);
  checks.push({
    key: "spf",
    severity: auth.spf_ok ? "ok" : "fail",
    ok: !!auth.spf_ok,
    msg: auth.spf_ok ? "SPF ok" : "SPF not verified",
    meta: { domain: domFrom }
  });
  checks.push({
    key: "dkim",
    severity: auth.dkim_ok ? "ok" : "fail",
    ok: !!auth.dkim_ok,
    msg: auth.dkim_ok ? "DKIM ok" : "DKIM not verified",
    meta: { domain: domFrom }
  });
  checks.push({
    key: "dmarc",
    severity: auth.dmarc_ok ? "ok" : "warn",
    ok: !!auth.dmarc_ok,
    msg: auth.dmarc_ok ? "DMARC ok" : "DMARC not found (recommend)",
    meta: { domain: domFrom }
  });

  try {
    const destSupp = await domainSuppressed(domTo, payload.account_id, payload.campaign_id ?? null);
    checks.push({
      key: "suppressed_domain",
      severity: destSupp ? "fail" : "ok",
      ok: !destSupp,
      msg: destSupp ? `Domain ${domTo} suppressed` : "Domain allowed"
    });
  } catch (error) {
    checks.push({
      key: "suppressed_domain",
      severity: "warn",
      ok: false,
      msg: `Domain suppression check failed: ${error instanceof Error ? error.message : "unknown"}`
    });
  }

  if (payload.to_email) {
    try {
      const { data, error } = await supabase.rpc("is_suppressed", {
        p_email: payload.to_email,
        p_account: payload.account_id ?? null,
        p_campaign: payload.campaign_id ?? null,
      });
      if (error) throw error;
      const suppressedEmail = !!data;
      checks.push({
        key: "suppressed_email",
        severity: suppressedEmail ? "fail" : "ok",
        ok: !suppressedEmail,
        msg: suppressedEmail ? "Email suppressed" : "Email allowed"
      });
    } catch (error) {
      checks.push({
        key: "suppressed_email",
        severity: "warn",
        ok: false,
        msg: `Email suppression check failed: ${error instanceof Error ? error.message : "unknown"}`
      });
    }
  }

  const canSend = await canSendNow(payload.account_id, 1);
  checks.push({
    key: "quota",
    severity: canSend ? "ok" : "fail",
    ok: canSend,
    msg: canSend ? "Within send caps" : "Over send caps"
  });

  const urls = extractUrls(body);
  const caps = percentCaps(`${payload.subject} ${(payload.text ?? "").slice(0, 400)}`);
  const emojis = emojiCount(payload.subject);
  const tokens = unresolvedTokens(`${payload.subject} ${body}`);
  const imgRatio = ratioImageToText(body);
  const spamHits = SPAM.filter((w) => body.toLowerCase().includes(w));

  checks.push({
    key: "broken_links",
    severity: urls.length ? "warn" : "ok",
    ok: true,
    msg: urls.length ? `Found ${urls.length} link(s). Will verify.` : "No links found",
    meta: { urls }
  });
  checks.push({
    key: "caps",
    severity: caps > 40 ? "warn" : "ok",
    ok: caps <= 70,
    msg: `${caps}% caps in selection`
  });
  checks.push({
    key: "emoji",
    severity: emojis > 3 ? "warn" : "ok",
    ok: emojis <= 6,
    msg: `${emojis} emoji(s) in subject`
  });
  checks.push({
    key: "tokens_unresolved",
    severity: tokens.length ? "fail" : "ok",
    ok: tokens.length === 0,
    msg: tokens.length ? `Unresolved tokens: ${tokens.join(", ")}` : "All tokens resolved"
  });
  checks.push({
    key: "image_text_ratio",
    severity: imgRatio > 0.08 ? "warn" : "ok",
    ok: imgRatio < 0.15,
    msg: `Image/Text ratio ≈ ${imgRatio.toFixed(2)}`
  });
  checks.push({
    key: "spam_phrases",
    severity: spamHits.length ? "warn" : "ok",
    ok: spamHits.length <= 2,
    msg: spamHits.length ? `Spammy phrases: ${spamHits.join(", ")}` : "No spammy phrases detected"
  });

  const hasUnsub = /\/api\/unsub\?e=/.test(body) || /List-Unsubscribe/i.test(body);
  checks.push({
    key: "unsubscribe",
    severity: hasUnsub ? "ok" : "warn",
    ok: hasUnsub,
    msg: hasUnsub ? "Unsubscribe present" : "Add List-Unsubscribe (recommended)"
  });

  const { data: dup } = await supabase
    .from("send_queue")
    .select("id")
    .eq("subject", payload.subject)
    .gte("created_at", new Date(Date.now() - 14 * 86400e3).toISOString())
    .limit(1);

  const dupFound = (dup ?? []).length > 0;
  checks.push({
    key: "duplicate_subject",
    severity: dupFound ? "warn" : "ok",
    ok: !dupFound,
    msg: dupFound ? "Subject used recently" : "Subject unique (14d)"
  });

  return checks;
}

Deno.serve(async (req: Request) => {
  try {
    const raw = await req.json() as Payload;
    const payload = normalizePayload(raw);

    if (!payload.account_id || !payload.from_email || !payload.to_email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const checks = await computeChecks(payload);
    const severity = summarizeSeverity(checks);

    const { error } = await supabase.from("preflight_checks").insert({
      account_id: payload.account_id,
      message_id: payload.message_id ?? null,
      from_email: payload.from_email,
      to_email: payload.to_email,
      subject: payload.subject,
      body_preview: sanitizeBodyPreview(payload),
      severity,
      checks
    });

    if (error) {
      console.error("preflight insert error", error);
      return new Response(
        JSON.stringify({ error: "Failed to persist preflight results" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ severity, checks, failing: failingKeys(checks) }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("preflight error", err);
    return new Response(
      JSON.stringify({ error: "Invalid payload" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
});

