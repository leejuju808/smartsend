// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseOptions = { auth: { persistSession: false } as const };

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl!, supabaseKey!, supabaseOptions);
  try {
    const { message_id } = await req.json();
    if (!message_id) {
      return json({ ok: false, error: "missing_message_id" }, 400);
    }

    const { data: msg, error: msgError } = await supa
      .from("messages")
      .select(
        "id, account_id, lead_id, subject, body_text, body_html"
      )
      .eq("id", message_id)
      .maybeSingle();

    if (msgError) {
      console.error("signature-parse: message lookup failed", msgError);
      return json({ ok: false, error: "message_lookup_failed" }, 500);
    }

    if (!msg) {
      return json({ ok: false, error: "message_not_found" }, 404);
    }

    const text = extractSignatureRegion(msg.body_text, msg.body_html);
    if (!text) {
      return new Response(null, { status: 204 });
    }

    const rule = ruleParse(text);
    const llm = await llmParse(text);
    const fact = merge(rule, llm);

    if (!hasAnyValue(fact)) {
      return new Response(null, { status: 204 });
    }

    const row = {
      account_id: msg.account_id,
      message_id: msg.id,
      lead_id: msg.lead_id,
      phone: fact.phone ?? null,
      title: fact.title ?? null,
      company: fact.company ?? null,
      location: fact.location ?? null,
      tz_hint: fact.tz_hint ?? null,
      website: fact.website ?? null,
      socials: fact.socials ?? {},
      fullname: fact.fullname ?? null,
      raw: { rule, llm },
      confidence: fact.confidence ?? 0.85,
      source: "signature_v2",
    };

    const { error: insertError } = await supa.from("signature_facts").insert(row);
    if (insertError) {
      console.error("signature-parse: insert failed", insertError);
      return json({ ok: false, error: "insert_failed" }, 500);
    }

    await supa
      .rpc("rpc_merge_signature_into_lead", { p_lead_id: msg.lead_id })
      .catch((err) => console.error("signature-parse: merge RPC failed", err));

    return json({ ok: true, fact: row });
  } catch (err) {
    console.error("signature-parse error", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function extractSignatureRegion(plain?: string | null, html?: string | null) {
  let txt = plain || "";
  if (!txt || txt.length < 40) {
    txt = (html || "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
  }
  const lines = txt
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.slice(-12).join("\n");
}

function ruleParse(sig: string) {
  const phone = sig.match(/(\+?\d[\d\-\s().]{7,}\d)/)?.[1]?.trim();
  const linkedin = sig.match(/(https?:\/\/(www\.)?linkedin\.com\/[^\s]+)/i)?.[1];
  const twitter = sig.match(/(https?:\/\/(www\.)?(x|twitter)\.com\/[^\s]+)/i)?.[1];
  const website =
    !linkedin && !twitter ? sig.match(/\bhttps?:\/\/[^\s]+/i)?.[0] : undefined;
  const title = sig.match(
    /\b(CEO|Founder|Co[-\s]?founder|CTO|CMO|Head of [A-Za-z ]+|VP [A-Za-z ]+|Director|Manager)\b/i
  )?.[0];
  const company = sig.match(/(?:at|@)\s+([A-Z][A-Za-z0-9&'. ]{2,})/)?.[1];
  const nameLine = sig.split(/\n/).find((l) =>
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(l)
  );
  const tzHint = tzFromLocation(sig);
  const location = sig.match(/\b([A-Z][a-zA-Z]+,\s?[A-Z]{2})\b/)?.[1];

  return {
    phone,
    title,
    company,
    fullname: nameLine,
    website,
    socials: { linkedin, twitter },
    tz_hint: tzHint,
    location,
    confidence: score({ phone, title, company, website }),
  };
}

async function llmParse(sig: string) {
  if (!openaiKey) return {};
  const prompt = [
    "Extract email signature facts. Return strict JSON:",
    "{ fullname, phone, title, company, location, tz_hint, website, socials:{linkedin?,twitter?}, confidence }",
    "Only include data clearly present; do not guess. For US/CAN city+state, infer tz_hint if obvious.",
    "Signature text:\n```",
    sig.slice(0, 6000),
    "```",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("signature-parse: llm request failed", details);
      return {};
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return {};
    return safeJSON(content);
  } catch (err) {
    console.error("signature-parse: llm exception", err);
    return {};
  }
}

function merge(rule: any, llm: any) {
  const pick = <T>(a?: T, b?: T) => (b ?? a ?? undefined);
  return {
    fullname: pick(rule?.fullname, llm?.fullname),
    phone: pick(rule?.phone, llm?.phone),
    title: pick(rule?.title, llm?.title),
    company: pick(rule?.company, llm?.company),
    location: pick(rule?.location, llm?.location),
    tz_hint: pick(rule?.tz_hint, llm?.tz_hint),
    website: pick(rule?.website, llm?.website),
    socials: {
      linkedin: llm?.socials?.linkedin ?? rule?.socials?.linkedin,
      twitter: llm?.socials?.twitter ?? rule?.socials?.twitter,
    },
    confidence: Math.max(
      Number(rule?.confidence ?? 0),
      Number(llm?.confidence ?? 0) || 0.8,
    ),
  };
}

function tzFromLocation(s: string) {
  if (/\b(CA|WA|OR|NV|AZ|BC)\b/.test(s) || /\b(Pacific Time|PST|PDT)\b/i.test(s)) {
    return "America/Los_Angeles";
  }
  if (/\b(UT|CO|MT|NM)\b/.test(s) || /\b(MST|MDT)\b/i.test(s)) {
    return "America/Denver";
  }
  if (/\b(TX|IL|MN|WI|MB)\b/.test(s) || /\b(CST|CDT)\b/i.test(s)) {
    return "America/Chicago";
  }
  if (/\b(NY|MA|PA|FL|QC|ON)\b/.test(s) || /\b(EST|EDT)\b/i.test(s)) {
    return "America/New_York";
  }
  return undefined;
}

function score(obj: any) {
  const keys = ["phone", "title", "company", "website"];
  const hits = keys.filter((k) => obj[k]).length;
  return Math.min(0.99, 0.6 + 0.06 * hits);
}

function hasAnyValue(o: any) {
  return Boolean(
    o?.phone ||
      o?.title ||
      o?.company ||
      o?.location ||
      o?.website ||
      o?.fullname ||
      o?.tz_hint ||
      o?.socials?.linkedin ||
      o?.socials?.twitter,
  );
}

function safeJSON(input: unknown) {
  try {
    if (typeof input === "string") return JSON.parse(input);
    return typeof input === "object" && input !== null ? input : {};
  } catch {
    return {};
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY"); // optional but recommended

type Sig = {
  full_name?: string | null;
  title?: string | null;
  company?: string | null;
  phones?: { raw: string; e164?: string; label?: string }[];
  emails?: { email: string; label?: string }[];
  website?: string | null;
  timezone?: string | null; // IANA
  addr_text?: string | null;
  raw?: any;
};

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl, supabaseKey);
  try {
    const { message_id } = await req.json();

    const { data: msg, error: msgError } = await supa
      .from("messages")
      .select("id, account_id, lead_id, body_text, body_html, subject, snippet")
      .eq("id", message_id)
      .single();

    if (msgError || !msg) {
      throw new Error(`message not found: ${msgError?.message ?? message_id}`);
    }

    const text = pickSignatureBlock(extractText(msg));

    const rule = ruleExtract(text);

    let best: Sig = rule;
    if (openaiKey) {
      const llm = await llmExtract(text, openaiKey);
      best = mergeBest(rule, llm);
    }

    best.phones = (best.phones || []).map((p) => ({
      ...p,
      e164: normalizePhone(p.raw) ?? p.e164,
    }));

    best.emails = (best.emails || []).map((e) => ({
      ...e,
      email: e.email?.toLowerCase(),
    }));

    await supa.from("signature_facts").insert({
      account_id: msg.account_id,
      message_id: msg.id,
      lead_id: msg.lead_id,
      full_name: best.full_name ?? null,
      title: best.title ?? null,
      company: best.company ?? null,
      phones: best.phones ?? [],
      emails: best.emails ?? [],
      website: best.website ?? null,
      timezone: best.timezone ?? null,
      addr_text: best.addr_text ?? null,
      raw: best.raw ?? {},
    });

    if (msg.lead_id) {
      await supa.rpc("fn_apply_signature_enrichment", {
        p_account_id: msg.account_id,
        p_lead_id: msg.lead_id,
        p_name: best.full_name ?? null,
        p_title: best.title ?? null,
        p_company: best.company ?? null,
        p_tz: best.timezone ?? null,
        p_emails: best.emails ?? [],
        p_phones: best.phones ?? [],
        p_website: best.website ?? null,
      } as any);
    }

    return json({ ok: true, extracted: best });
  } catch (e) {
    console.error("signature-parse error", e);
    return json({ ok: false, error: String(e) }, 500);
  }
});

function extractText(msg: any) {
  const html = String(msg.body_html || "");
  const text = String(msg.body_text || "");
  if (text?.length >= 100) return text;
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSignatureBlock(text: string) {
  const tail = text.slice(-1200);
  const sigMarkers =
    /(best regards|cheers|thanks|sincerely|—|-{2,}|^--\s*$|sent from my)/i;
  const m = tail.match(sigMarkers);
  if (m) return tail.slice(tail.indexOf(m[0]));
  return tail;
}

function ruleExtract(text: string): Sig {
  const emails = Array.from(
    new Set(
      (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((s) =>
        s.toLowerCase()
      ),
    ),
  ).slice(0, 4);
  const phonesRaw =
    (text.match(/(\+?\d[\d\s().-]{6,}\d)/g) || []).slice(0, 6);

  const url = (text.match(/\bhttps?:\/\/[^\s)]+/i) || [null])[0];

  const titleMatch = text.match(
    /\b(CEO|Founder|Co[- ]?founder|CTO|COO|CFO|VP|Head of [A-Za-z ]+|Director|Manager)\b/i,
  );
  const companyMatch =
    text.match(/\b( at |, )(?:the )?([A-Z][A-Za-z0-9&.\- ]{2,})\b/);

  const tz = tzGuess(text);

  return {
    full_name: guessName(text),
    title: titleMatch?.[0] || null,
    company: (companyMatch && companyMatch[2]) || null,
    phones: phonesRaw.map((p) => ({ raw: p })),
    emails: emails.map((e) => ({ email: e })),
    website: url,
    timezone: tz || null,
    raw: { rule: true },
  };
}

function tzGuess(t: string): string | null {
  const map: Record<string, string> = {
    PST: "America/Los_Angeles",
    PDT: "America/Los_Angeles",
    MST: "America/Denver",
    MDT: "America/Denver",
    CST: "America/Chicago",
    CDT: "America/Chicago",
    EST: "America/New_York",
    EDT: "America/New_York",
    GMT: "Europe/London",
    BST: "Europe/London",
    CET: "Europe/Paris",
    CEST: "Europe/Paris",
  };
  const m = t.match(
    /\b(PST|PDT|MST|MDT|CST|CDT|EST|EDT|GMT|BST|CET|CEST)\b/i,
  );
  return m ? map[m[1].toUpperCase()] : null;
}

function guessName(t: string): string | null {
  const lines = t
    .split(/\n|\r/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^(thanks|regards|cheers|sincerely)/i.test(line)) continue;
    if (/@/.test(line)) continue;
    if (line.length <= 3) continue;
    if (/\b(CEO|Founder|Director|Manager|Engineer)\b/i.test(line)) continue;
    const m = line.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z\-']+)\b/);
    if (m) return `${m[1]} ${m[2]}`;
  }
  return null;
}

function normalizePhone(raw: string | undefined | null) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

async function llmExtract(text: string, key: string): Promise<Sig> {
  try {
    const prompt = [
      "Extract email signature fields as strict JSON keys:",
      "full_name, title, company, phones (list of {raw,label?}), emails (list of {email,label?}), website, timezone (IANA), addr_text.",
      "If unknown, set null or empty list. Only use information that looks like a signature/footer.",
      "Text:",
      text.slice(0, 4000),
    ].join("\n\n");

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content ?? "{}";
    try {
      return JSON.parse(content) as Sig;
    } catch {
      return { raw: { parse_error: true } } as Sig;
    }
  } catch (error) {
    console.error("llmExtract failed", error);
    return { raw: { llm_error: String(error) } } as Sig;
  }
}

function mergeBest(rule: Sig, llm: Sig): Sig {
  return {
    full_name: llm.full_name || rule.full_name || null,
    title: llm.title || rule.title || null,
    company: llm.company || rule.company || null,
    phones:
      (llm.phones && llm.phones.length ? llm.phones : rule.phones) || [],
    emails:
      (llm.emails && llm.emails.length ? llm.emails : rule.emails) || [],
    website: llm.website || rule.website || null,
    timezone: llm.timezone || rule.timezone || null,
    addr_text: llm.addr_text || null,
    raw: { rule, llm },
  };
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

