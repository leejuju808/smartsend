import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl, supabaseKey);
  try {
    const { message_id } = await req.json();

    // Load message (assume this is an inbound DSN you already stored)
    const { data: msg, error: msgError } = await supa
      .from("messages")
      .select(
        "id,account_id,lead_id,thread_id,from_email,to_email,subject,body_text,body_html,provider,received_at"
      )
      .eq("id", message_id)
      .single();

    if (msgError || !msg) {
      throw new Error(msgError?.message || "Message not found");
    }

    const text = extractText(msg);
    const parsed = parseBounce(text);

    // Decide action
    const action = decideAction(parsed, msg);

    // Persist ledger
    const { error: insertError } = await supa.from("bounce_events").insert({
      account_id: msg.account_id,
      message_id: msg.id,
      lead_id: msg.lead_id,
      smtp_code: parsed.smtp_code,
      provider: parsed.provider || msg.provider || null,
      raw_excerpt: parsed.excerpt,
      reason_key: parsed.reason,
      action_key: action.key,
      action_payload: action.payload,
      confidence: parsed.confidence,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    // Apply effects
    await applyAction(supa, msg, action);

    return json({ ok: true, parsed, action });
  } catch (e) {
    console.error("bounce-intel error", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

function extractText(m: any) {
  const t = (m.body_text || "").toString();
  if (t.length > 60) return t;
  return (m.body_html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Parsed = {
  smtp_code?: string;
  reason:
    | "user_unknown"
    | "mailbox_full"
    | "policy_block"
    | "dns_error"
    | "rate_limit"
    | "content_block"
    | "spam_block"
    | "temp_error"
    | "other";
  provider?: string;
  confidence: number;
  excerpt: string;
};

function parseBounce(text: string): Parsed {
  const lower = text.toLowerCase();
  const code =
    (text.match(/\b(\d{3}\s(?:\d\.\d\.\d|\d{1,3}))\b/) || [])[1] || null;

  // Map regex → reason
  const patterns: Array<[RegExp, Parsed["reason"]]> = [
    [
      /(user unknown|unknown user|no such user|5\.1\.1|recipient address rejected)/i,
      "user_unknown",
    ],
    [/(mailbox full|quota exceeded|5\.2\.2)/i, "mailbox_full"],
    [
      /(spf|dmarc|dkim).*fail|policy reason|blocked by policy|550 5\.7\./i,
      "policy_block",
    ],
    [/(host|domain) not found|dns error|no mx record/i, "dns_error"],
    [
      /(rate limit|try again later|4\.\d\.\d|temporar(?:y|ily) unavailable)/i,
      "rate_limit",
    ],
    [/(message content rejected|blocked content|content policy)/i, "content_block"],
    [/(spam|blacklist|reputation)/i, "spam_block"],
    [/(temporary|4\.\d\.\d)/i, "temp_error"],
  ];

  let reason: Parsed["reason"] = "other";
  for (const [re, r] of patterns) {
    if (re.test(text)) {
      reason = r;
      break;
    }
  }

  // Provider hint
  const provider = /google|gmail|googlemail/i.test(lower)
    ? "gmail"
    : /outlook|office365|microsoft/i.test(lower)
    ? "outlook"
    : /yahoo/i.test(lower)
    ? "yahoo"
    : /postfix|exim|sendmail|mailgun|ses/i.test(lower)
    ? (lower.match(/postfix|exim|sendmail|mailgun|ses/) || [""])[0]
    : undefined;

  return {
    smtp_code: code || undefined,
    reason,
    provider,
    confidence: code ? 0.95 : 0.8,
    excerpt: text.slice(0, 400),
  };
}

function decideAction(p: Parsed, msg: any) {
  const domain = (msg.to_email || "").split("@")[1]?.toLowerCase() || "";
  switch (p.reason) {
    case "user_unknown":
      return { key: "remove_lead", payload: { set_deliverability: "bounced" } };
    case "mailbox_full":
      return {
        key: "retry_later",
        payload: { after_hours: 48, preset: "gentle_followup" },
      };
    case "policy_block":
      return {
        key: "verify_alt",
        payload: { check_dns: true, dmarc: "relaxed", from_pool: "dkim_warm" },
      };
    case "dns_error":
      return { key: "verify_alt", payload: { verify_domain: true } };
    case "rate_limit":
      return {
        key: "pause_domain",
        payload: { domain, until_hours: 12, reason: "rate_limit" },
      };
    case "content_block":
      return {
        key: "adjust_content",
        payload: { preset: "low_spam_template" },
      };
    case "spam_block":
      return {
        key: "pause_domain",
        payload: {
          domain,
          until_hours: 24,
          reduce_volume: true,
          reason: "spam_block",
        },
      };
    case "temp_error":
      return { key: "retry_later", payload: { after_hours: 6 } };
    default:
      return { key: "verify_alt", payload: {} };
  }
}

async function applyAction(
  supa: any,
  msg: any,
  action: { key: string; payload: any }
) {
  const leadId = msg.lead_id;
  switch (action.key) {
    case "remove_lead":
      if (leadId) {
        await supa
          .from("leads")
          .update({
            deliverability: "bounced",
            updated_at: new Date().toISOString(),
            next_nudge_preset: "verify_alt",
          })
          .eq("id", leadId);
      }
      break;
    case "retry_later":
      // store a suggestion via Thread Intel NBA or set a scheduled follow-up in your queue system
      if (leadId) {
        await supa
          .from("leads")
          .update({
            next_nudge_preset:
              action.payload?.preset || "gentle_followup",
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
      break;
    case "verify_alt":
      if (leadId) {
        await supa
          .from("leads")
          .update({
            next_nudge_preset: "verify_alt",
            deliverability: "risk",
            updated_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }
      break;
    case "pause_domain":
      if (action.payload?.domain) {
        const until = new Date(
          Date.now() + Number(action.payload.until_hours || 12) * 3600 * 1000
        ).toISOString();
        await supa.from("domain_suppressions").upsert(
          {
            account_id: msg.account_id,
            domain: action.payload.domain,
            reason: action.payload.reason || "spam_block",
            until,
          },
          { onConflict: "account_id,domain" }
        );
      }
      break;
    case "adjust_content":
      await supa
        .from("leads")
        .update({
          next_nudge_preset: "low_spam_template",
          updated_at: new Date().toISOString(),
        })
        .eq("id", msg.lead_id);
      break;
  }
}

function json(b: any, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });
}

