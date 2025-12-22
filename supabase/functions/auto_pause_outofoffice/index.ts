import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OOO_REGEX =
  /(out of office|on vacation|away until|automatic reply|auto(?:matic)? response|away from (?:the )?office|will return on|back on|back\s+\w+)/i;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const DOW = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function nextDow(dow: number, from = new Date()): Date {
  const d = new Date(from);
  const diff = ((dow + 7 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(9, 0, 0, 0);
  return d;
}

function parseReturnDate(text: string): Date | null {
  const s = text.toLowerCase();

  const reDmy =
    /(?:\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s*(\d{4})?)/i;
  const reMdy =
    /(?:\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?)/i;
  const reSlash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
  const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/;

  const now = new Date();
  const yearDefault = now.getFullYear();
  const nowMonth = now.getMonth();

  const dmyMatch = s.match(reDmy);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const mon = MONTHS.findIndex((n) =>
      n.startsWith(dmyMatch[2].toLowerCase().slice(0, 3))
    );
    if (mon >= 0) {
      const year = dmyMatch[3]
        ? parseInt(dmyMatch[3], 10)
        : (nowMonth > mon ? yearDefault + 1 : yearDefault);
      return new Date(Date.UTC(year, mon, day, 17, 0, 0));
    }
  }

  const mdyMatch = s.match(reMdy);
  if (mdyMatch) {
    const mon = MONTHS.findIndex((n) =>
      n.startsWith(mdyMatch[1].toLowerCase().slice(0, 3))
    );
    if (mon >= 0) {
      const day = parseInt(mdyMatch[2], 10);
      const year = mdyMatch[3]
        ? parseInt(mdyMatch[3], 10)
        : (nowMonth > mon ? yearDefault + 1 : yearDefault);
      return new Date(Date.UTC(year, mon, day, 17, 0, 0));
    }
  }

  const slashMatch = s.match(reSlash);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    if (month >= 0 && month < 12) {
      let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : yearDefault;
      if (year < 100) year += 2000;
      return new Date(Date.UTC(year, month, day, 17, 0, 0));
    }
  }

  const isoMatch = s.match(reIso);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    if (month >= 0 && month < 12) {
      return new Date(Date.UTC(year, month, day, 17, 0, 0));
    }
  }

  for (let i = 0; i < DOW.length; i++) {
    if (
      s.includes(`next ${DOW[i]}`) ||
      s.includes(`back ${DOW[i]}`) ||
      s.includes(`return ${DOW[i]}`)
    ) {
      return nextDow(i);
    }
  }

  const rel = s.match(/\b(in|for)\s+(\d{1,2})\s+(day|days|week|weeks)\b/);
  if (rel) {
    const [, , amtStr, unit] = rel;
    const amt = parseInt(amtStr, 10);
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    if (unit.startsWith("day")) {
      d.setDate(d.getDate() + amt);
    } else {
      d.setDate(d.getDate() + amt * 7);
    }
    return d;
  }

  return null;
}

type PauseRequest = {
  message_id: string;
  reply_text?: string;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: PauseRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  const { message_id, reply_text } = payload ?? {};
  if (!message_id) {
    return new Response("message_id required", { status: 400 });
  }

  const text = reply_text ?? "";
  if (!OOO_REGEX.test(text)) {
    return new Response(JSON.stringify({ paused: false }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data: lead, error } = await supabase
    .from("send_logs")
    .select("lead_id, campaign_id")
    .eq("id", message_id)
    .maybeSingle();

  if (error) {
    console.error("auto_pause_outofoffice::send_logs error", error);
    return new Response(
      JSON.stringify({ paused: false, error: "internal_error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  if (!lead) {
    return new Response(JSON.stringify({ paused: false }), {
      headers: { "content-type": "application/json" },
    });
  }

  const snoozeUntil = text ? parseReturnDate(text) : null;

  const { data: affected, error: pauseError } = await supabase.rpc(
    "safe_pause_followups",
    {
      p_campaign_id: lead.campaign_id,
      p_lead_id: lead.lead_id,
      p_reason: "ooo_auto",
      p_snooze_until: snoozeUntil ? snoozeUntil.toISOString() : null,
    },
  );

  if (pauseError) {
    console.error("auto_pause_outofoffice::safe_pause_followups error", pauseError);
    return new Response(
      JSON.stringify({ paused: false, error: "pause_failed" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let finalSnooze: string | null = snoozeUntil?.toISOString() ?? null;

  if ((affected ?? 0) > 0) {
    const { data: snoozeRow, error: snoozeErr } = await supabase
      .from("followup_tasks")
      .select("snooze_until")
      .eq("lead_id", lead.lead_id)
      .eq("campaign_id", lead.campaign_id)
      .eq("status", "paused")
      .order("snooze_until", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!snoozeErr && snoozeRow?.snooze_until) {
      finalSnooze = snoozeRow.snooze_until;
    }
  }

  return new Response(
    JSON.stringify({
      paused: (affected ?? 0) > 0,
      snooze_until: finalSnooze,
      affected: affected ?? 0,
    }),
    {
    headers: { "content-type": "application/json" },
    }
  );
});


