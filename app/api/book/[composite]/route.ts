import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildICS, googleLink, outlookLink } from "@/lib/calendar";

const PUBLIC_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function GET(
  _req: NextRequest,
  { params }: { params: { composite: string } },
) {
  if (!PUBLIC_URL || !SERVICE_KEY || !APP_URL) {
    return new Response("Service misconfigured.", { status: 500 });
  }

  const [threadId, slotId] = (params.composite || "").split(":");
  if (!threadId || !slotId) {
    return new Response("Invalid link.", { status: 400 });
  }

  const baseAppUrl = APP_URL.replace(/\/$/, "");

  const sb = createClient(PUBLIC_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: tok, error: tokErr } = await sb
    .from("meeting_booking_tokens")
    .select("id,thread_id,slot_id,lead_email,expires_at,used_at")
    .eq("thread_id", threadId)
    .eq("slot_id", slotId)
    .maybeSingle();

  if (tokErr) {
    return new Response("Could not validate booking link.", { status: 500 });
  }

  if (!tok) {
    return new Response("This booking link is invalid.", { status: 404 });
  }
  if (tok.used_at) {
    return NextResponse.redirect(`${baseAppUrl}/booked?status=already`);
  }
  if (new Date(tok.expires_at) < new Date()) {
    return NextResponse.redirect(`${baseAppUrl}/booked?status=expired`);
  }

  const [{ data: slot }, { data: thread }] = await Promise.all([
    sb.from("meeting_slots").select("*").eq("id", slotId).maybeSingle(),
    sb.from("inbox_threads").select("id,campaign_id,lead_id,subject").eq("id", threadId).maybeSingle(),
  ]);

  if (!slot || !thread) {
    return new Response("Missing meeting context.", { status: 400 });
  }

  const { data: prefs } = await sb
    .from("meeting_prefs")
    .select("location,confirmation_template,duration_min")
    .eq("campaign_id", thread.campaign_id)
    .maybeSingle();

  let lead: { first_name?: string | null; last_name?: string | null; email?: string | null } | null = null;
  if (thread.lead_id) {
    const { data: leadRow } = await sb
      .from("leads")
      .select("first_name,last_name,email")
      .eq("id", thread.lead_id)
      .maybeSingle();
    lead = leadRow ?? null;
  }
  if (!lead && tok.lead_email) {
    lead = { first_name: null, last_name: null, email: tok.lead_email };
  }

  const start = new Date(slot.start_utc);
  const end = new Date(slot.end_utc);
  const title = "Intro call";
  const location = prefs?.location || "Google Meet";

  const ics = buildICS({
    uid: crypto.randomUUID(),
    title,
    description: "Confirmed via booking link.",
    start,
    end,
    organizer: { name: "SmartSend", email: "noreply@smartsend" },
    attendee: {
      name: `${lead?.first_name || ""} ${lead?.last_name || ""}`.trim(),
      email: lead?.email || tok.lead_email || "",
    },
    location,
  });

  const google = googleLink({
    title,
    start,
    end,
    details: "Confirmed via booking link.",
    location,
  });
  const outlook = outlookLink({
    title,
    start,
    end,
    body: "Confirmed via booking link.",
    location,
  });

  const format = (d: Date) =>
    d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const body = (() => {
    const tpl = prefs?.confirmation_template;
    if (!tpl) {
      return [
        `Hi ${lead?.first_name || ""},`,
        ``,
        `Booked: **${format(start)} – ${format(end)}**`,
        `Location: ${location}`,
        ``,
        `Add to calendar:`,
        `• Google: ${google}`,
        `• Outlook: ${outlook}`,
        ``,
        `You'll also find an .ics invite attached.`,
        ``,
        `— SmartSend`,
      ].join("\n");
    }
    return tpl
      .replaceAll("{lead_first}", lead?.first_name || "")
      .replaceAll("{duration}", String(prefs?.duration_min ?? 30))
      .replaceAll("{location}", location)
      .replaceAll("{start}", format(start))
      .replaceAll("{end}", format(end))
      .replaceAll("{gcal}", google)
      .replaceAll("{outlook}", outlook);
  })();

  const { error: queueErr } = await sb
    .from("send_queue")
    .insert({
      campaign_id: thread.campaign_id,
      lead_id: thread.lead_id,
      thread_id: thread.id,
      subject: `Re: ${thread.subject || "Scheduling confirmation"}`,
      body,
      headers: { to: lead?.email || tok.lead_email },
      status: "draft",
      source: "meeting_autobook",
      attachments: [
        {
          name: "invite.ics",
          bucket: "ics",
          path: `${thread.id}/invite-${slot.id}.ics`,
          content_type: "text/calendar; method=REQUEST",
          kind: "calendar_invite",
          title,
          location,
        },
      ],
    })
    .select("id")
    .maybeSingle();

  if (queueErr) {
    return new Response("Could not queue confirmation.", { status: 500 });
  }

  const upload = await sb.storage
    .from("ics")
    .upload(`${thread.id}/invite-${slot.id}.ics`, new Blob([ics], { type: "text/calendar" }), {
      upsert: true,
      contentType: "text/calendar",
    });
  if (upload.error) {
    // Not fatal, continue
  }

  await Promise.all([
    sb
      .from("inbox_threads")
      .update({
        proposed_meeting: false,
        booked_meeting_at: start.toISOString(),
        needs_reply: false,
      })
      .eq("id", thread.id),
    sb
      .from("meeting_booking_tokens")
      .update({ used_at: new Date().toISOString(), used_by: lead?.email || tok.lead_email })
      .eq("id", tok.id),
  ]);

  return NextResponse.redirect(`${baseAppUrl}/booked?status=ok&start=${encodeURIComponent(start.toISOString())}`);
}

