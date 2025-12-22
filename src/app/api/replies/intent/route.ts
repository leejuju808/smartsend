import { NextResponse } from 'next/server';
import { detectReplyIntent } from '@/lib/meeting-intent';
import { buildIcs } from '@/lib/ics-generator';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/replies/intent
 * Body: {
 *   userId: string,                // required (auth.users.id)
 *   fromEmail: string,             // contact email
 *   subject?: string,
 *   threadId?: string,
 *   bodyText: string,              // raw reply text
 *   timezone?: string,             // e.g. "America/Los_Angeles" (optional; used only for proposal text)
 *   durationMins?: number          // default 30
 * }
 *
 * Returns JSON:
 *  { isMeeting, score, reasons, calendlyLink, reply, ics: {filename, content}, meeting }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, fromEmail, subject = 'Re: Chat', threadId = '', bodyText, timezone, durationMins } = body || {};

    if (!userId || !fromEmail || !bodyText) {
      return NextResponse.json({ error: 'Missing required fields: userId, fromEmail, bodyText' }, { status: 400 });
    }

    const intent = await detectReplyIntent(bodyText);

    // Always return intent; only proceed to create meeting when true
    if (!intent.isMeeting) {
      return NextResponse.json({
        isMeeting: false,
        score: intent.score,
        reasons: intent.reasons,
        model: intent.model ?? 'heuristic'
      });
    }

    // Lookup user's Calendly link from profiles; fallback to env
    let calendlyLink = process.env.NEXT_PUBLIC_CALENDLY_URL || '';
    const { data: profileRow, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('calendly_url')
      .eq('id', userId)
      .maybeSingle();

    if (!profileErr && profileRow?.calendly_url) {
      calendlyLink = profileRow.calendly_url;
    }

    // Propose a near-term slot (tomorrow 10:00–10:30 local); ICS uses UTC
    const proposed = proposeWindow({ base: new Date(), tz: timezone || 'America/Los_Angeles', minutes: Number(durationMins) || 30 });

    const ics = buildIcs({
      summary: 'Intro Call — SmartSend',
      description: `If this time works, reply "Confirmed" or book any time here: ${calendlyLink || 'your Calendly link'}.`,
      startAt: proposed.startUtc,
      endAt: proposed.endUtc,
      organizerEmail: 'no-reply@smartsend.ai',
      attendeeEmail: fromEmail,
      location: 'Video',
      url: calendlyLink || undefined,
    });

    // Persist meeting (status=proposed)
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('meetings')
      .insert([{
        user_id: userId,
        contact_email: fromEmail,
        thread_id: threadId,
        subject,
        start_at: proposed.startUtc.toISOString(),
        end_at: proposed.endUtc.toISOString(),
        status: 'proposed',
        calendly_link: calendlyLink || null,
        ics: ics.content,
        location: 'Video'
      }])
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: 'Failed to create meeting row', details: insertErr.message }, { status: 500 });
    }

    const replyText = composeReply({
      calendlyLink,
      fromEmail,
      readableSlot: proposed.readableLocal,
      duration: Number(durationMins) || 30
    });

    return NextResponse.json({
      isMeeting: true,
      score: intent.score,
      reasons: intent.reasons,
      model: intent.model ?? 'heuristic',
      calendlyLink,
      reply: {
        subject: `Re: ${subject}`,
        text: replyText,
      },
      ics: {
        filename: ics.filename,
        content: ics.content
      },
      meeting: inserted
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'Handler crashed', details: String(e?.message || e) }, { status: 500 });
  }
}

/** Returns tomorrow 10:00 local (or next business day if weekend) for {minutes} */
function proposeWindow(opts: { base: Date; tz: string; minutes: number }) {
  const base = new Date(opts.base);
  // Move to tomorrow
  const local = new Date(base.getTime() + 24 * 60 * 60 * 1000);
  // Force to 10:00 local time
  local.setHours(10, 0, 0, 0);

  // If weekend, push to Monday
  const day = local.getDay(); // 0=Sun 6=Sat
  if (day === 0) local.setDate(local.getDate() + 1);
  if (day === 6) local.setDate(local.getDate() + 2);

  const startLocal = local;
  const endLocal = new Date(startLocal.getTime() + opts.minutes * 60 * 1000);

  // Convert to UTC for ICS
  const startUtc = new Date(startLocal.getTime() - startLocal.getTimezoneOffset() * 60000);
  const endUtc = new Date(endLocal.getTime() - endLocal.getTimezoneOffset() * 60000);

  const readableLocal = startLocal.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });

  return { startUtc, endUtc, readableLocal };
}

function composeReply(args: { calendlyLink?: string; fromEmail: string; readableSlot: string; duration: number }) {
  const line1 = `Great to connect, ${args.fromEmail.split('@')[0]} — let's lock a time.`;
  const line2 = args.calendlyLink
    ? `• Book here (fastest): ${args.calendlyLink}`
    : `• I can send more times if you prefer — just reply with a few windows.`;
  const line3 = `• Or, if ${args.readableSlot} (${args.duration} min) works, reply "Confirmed" — I've attached a calendar invite.`;
  return [line1, line2, line3, '', 'Talk soon! — Julian'].join('\n');
} 