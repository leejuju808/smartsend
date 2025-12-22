// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "npm:@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_KEY =
  Deno.env.get("OPENAI_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase credentials are not configured");
}

if (!OPENAI_KEY) {
  throw new Error("OPENAI_KEY (or OPENAI_API_KEY) must be configured");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_KEY });

function toISO(dt: Date, _tz: string) {
  // Convert local-in-tz semantic into UTC ISO.
  return dt.toISOString();
}

function makeICS(opts: {
  uid: string;
  title: string;
  desc?: string;
  location?: string;
  startUTC: string;
  endUTC: string;
  organizer?: string;
  attendee?: string;
}) {
  const dtStart = opts.startUTC.replace(/[-:]/g, "").split(".")[0] + "Z";
  const dtEnd = opts.endUTC.replace(/[-:]/g, "").split(".")[0] + "Z";
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmartSendAI//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${opts.title}`,
    `DESCRIPTION:${(opts.desc ?? "").replace(/\n/g, "\\n")}`,
    opts.location ? `LOCATION:${opts.location}` : "",
    opts.organizer ? `ORGANIZER:${opts.organizer}` : "",
    opts.attendee ? `ATTENDEE:${opts.attendee}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .filter(Boolean)
    .join("\r\n");
}

async function jsonResponse(
  data: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...(headers ?? {}) },
  });
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const threadId = payload?.thread_id ?? payload?.threadId;
  if (!threadId) {
    return new Response("thread_id required", { status: 400 });
  }

  const { data: ctx, error: ctxErr } = await supabase
    .from("v_thread_context")
    .select("*")
    .eq("thread_id", threadId)
    .single();

  if (ctxErr || !ctx) {
    console.error("context error", ctxErr);
    return new Response("context not found", { status: 404 });
  }

  const tz = ctx.tz ?? "America/Los_Angeles";
  const duration = ctx.duration_min ?? 30;

  const now = new Date();
  const startHour = ctx.start_hour ?? 10;

  const d1 = new Date(now);
  d1.setDate(d1.getDate() + 1);
  d1.setHours(startHour, 0, 0, 0);

  const d2 = new Date(now);
  d2.setDate(d2.getDate() + 2);
  d2.setHours(startHour + 2, 0, 0, 0);

  const d1End = new Date(d1.getTime() + duration * 60 * 1000);
  const d2End = new Date(d2.getTime() + duration * 60 * 1000);

  const opt1Label = d1.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const opt2Label = d2.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const bookingLink = Deno.env.get("BOOKING_LINK") ?? "";

  const prompt = `
You're an SDR confirming next steps after a positive reply.
Context:
- Lead: ${ctx.first_name ?? ""} ${ctx.last_name ?? ""} at ${ctx.company ?? ""}
- Their latest reply (for tone only): """${ctx.inbound_text ?? ""}"""
- Goal: Confirm interest and propose 2 times (${duration} min) in ${tz}:
  1) ${opt1Label}
  2) ${opt2Label}
- Include "${
    bookingLink
      ? `or use my booking link: ${bookingLink}`
      : "or share a couple times that work"
  }".
- Tone: crisp, friendly, low-friction. 120-150 words.
Return JSON with keys: subject, body.
  `;

  const ai = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }],
  });

  let subject = "Locking a time";
  let body = ai.choices[0]?.message?.content?.trim() ?? "";

  try {
    const parsed = JSON.parse(body);
    subject = parsed.subject ?? subject;
    body = parsed.body ?? body;
  } catch {
    // ignore parse errors; fall back to raw content
  }

  const { data: taskId, error: taskErr } = await supabase.rpc(
    "ensure_schedule_task",
    { p_thread: threadId, p_campaign: ctx.campaign_id },
  );

  if (taskErr) {
    console.error("ensure_schedule_task failed", taskErr);
    return new Response("failed to ensure task", { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("followup_tasks")
    .update({ suggested_reply: body })
    .eq("id", taskId);

  if (updateErr) {
    console.error("update followup_tasks failed", updateErr);
  }

  const ics1 = makeICS({
    uid: crypto.randomUUID(),
    title: `Intro Call — ${ctx.company ?? "SmartSend"}`,
    desc: "Intro call about SmartSend AI.",
    startUTC: toISO(d1, tz),
    endUTC: toISO(d1End, tz),
    organizer: "",
    attendee: ctx.email ? `mailto:${ctx.email}` : undefined,
  });

  const ics2 = makeICS({
    uid: crypto.randomUUID(),
    title: `Intro Call — ${ctx.company ?? "SmartSend"}`,
    desc: "Intro call about SmartSend AI.",
    startUTC: toISO(d2, tz),
    endUTC: toISO(d2End, tz),
    organizer: "",
    attendee: ctx.email ? `mailto:${ctx.email}` : undefined,
  });

  const bucket = "system_artifacts";

  try {
    await supabase.storage.from(bucket).upload(
      `invites/${threadId}-opt1.ics`,
      new Blob([ics1], { type: "text/calendar" }),
      { upsert: true },
    );
    await supabase.storage.from(bucket).upload(
      `invites/${threadId}-opt2.ics`,
      new Blob([ics2], { type: "text/calendar" }),
      { upsert: true },
    );
  } catch (err) {
    console.error("storage upload failed", err);
  }

  const { data: s1 } = await supabase.storage
    .from(bucket)
    .createSignedUrl(`invites/${threadId}-opt1.ics`, 60 * 60);
  const { data: s2 } = await supabase.storage
    .from(bucket)
    .createSignedUrl(`invites/${threadId}-opt2.ics`, 60 * 60);

  return jsonResponse({
    ok: true,
    task_id: taskId,
    subject,
    body,
    ics_opt1_url: s1?.signedUrl ?? null,
    ics_opt2_url: s2?.signedUrl ?? null,
    options: { opt1Label, opt2Label },
  });
}

Deno.serve(handler);








