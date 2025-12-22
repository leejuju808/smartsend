// File: app/api/worker/interest-nudge/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/,"");
const FROM_EMAIL = process.env.FROM_EMAIL || "SmartSend <noreply@example.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY!;

async function sendNudgeEmail(to: string, schedulingUrl: string) {
  const subject = "Quick nudge to book our demo";
  const html = [
    `<p>Hi ${to.split("@")[0]},</p>`,
    `<p>Thanks again for your interest. Here's a quick link to grab a time:</p>`,
    `<p><a href="${schedulingUrl}" target="_blank" rel="noopener">Book a 15-min SmartSend demo</a></p>`,
    `<p>If none of those times work, reply with a couple that do and I'll send a calendar invite.</p>`,
    `<p>— SmartSend</p>`
  ].join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.message || "Resend send failed");
  return j?.id || j?.data?.id || null;
}

/**
 * POST { user_id: string, take?: number }
 * Finds inbound messages with reply_intent='Interested' older than nudge_delay_hours,
 * where NO meeting exists (invitee_email = from_email) after the reply, and no prior nudge.
 * Sends exactly one nudge per lead (enforced by table + max_nudges_per_lead).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const user_id = String(body.user_id || "").trim();
    const take = Math.min(Math.max(Number(body.take || 50), 1), 200);
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

    const client = sb();

    // Load sender settings
    const { data: settings, error: sErr } = await client
      .from("sender_settings")
      .select("scheduling_url, nudge_delay_hours, max_nudges_per_lead")
      .eq("user_id", user_id)
      .maybeSingle();
    if (sErr) throw sErr;

    const schedulingUrl = settings?.scheduling_url;
    if (!schedulingUrl) {
      return NextResponse.json({ processed: 0, reason: "missing_scheduling_url" }, { status: 200 });
    }
    const delayHrs = settings?.nudge_delay_hours ?? 24;

    // Candidate "Interested" replies older than delay, last 7 days window
    const { data: candidates, error: cErr } = await client
      .from("messages")
      .select("id, from_email, user_id, created_at")
      .eq("user_id", user_id)
      .eq("direction", "inbound")
      .ilike("reply_intent", "Interested")
      .lt("created_at", new Date(Date.now() - delayHrs * 3600 * 1000).toISOString())
      .gte("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500); // fetch pool, we'll filter further below
    if (cErr) throw cErr;

    if (!candidates?.length) {
      return NextResponse.json({ processed: 0, reason: "no_candidates" }, { status: 200 });
    }

    // Load existing nudges to avoid duplicates
    const prospectEmails = Array.from(new Set(candidates.map((m) => (m.from_email || "").toLowerCase()).filter(Boolean)));
    const { data: nudges } = await client
      .from("interested_nudges")
      .select("prospect_email")
      .eq("user_id", user_id)
      .in("prospect_email", prospectEmails);
    const nudgedSet = new Set((nudges || []).map((n: any) => String(n.prospect_email).toLowerCase()));

    // Load meetings to see who already booked
    const { data: meetings } = await client
      .from("meetings")
      .select("invitee_email, created_at, status, user_id")
      .eq("user_id", user_id)
      .gte("created_at", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString());

    const bookedSet = new Set(
      (meetings || [])
        .filter((m: any) => m.status !== "canceled")
        .map((m: any) => String(m.invitee_email || "").toLowerCase())
    );

    // Filter: not nudged before, not booked, enforce take
    const toNudge = candidates
      .filter((m) => m.from_email)
      .filter((m) => !nudgedSet.has(String(m.from_email).toLowerCase()))
      .filter((m) => !bookedSet.has(String(m.from_email).toLowerCase()))
      .slice(0, take);

    let sent = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const m of toNudge) {
      const email = String(m.from_email).toLowerCase();
      try {
        await sendNudgeEmail(email, schedulingUrl);
        await client.from("interested_nudges").insert({
          user_id,
          prospect_email: email,
          source_message_id: m.id,
          status: "sent",
        });
        sent++;
      } catch (e: any) {
        await client.from("interested_nudges").insert({
          user_id,
          prospect_email: email,
          source_message_id: m.id,
          status: "failed",
          last_error: e?.message || String(e),
        });
        errors.push({ email, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ processed: toNudge.length, sent, errors });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "server_error" }, { status: 500 });
  }
}
