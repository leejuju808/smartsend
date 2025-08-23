import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { buildSimpleICS } from "@/lib/ics";
import { wantsMeeting } from "@/lib/meeting-intent";
import { supabaseAdmin } from "@/server/supabase";
import { extractStyleSample, mergeStyles } from "@/lib/style-extractor";
import { getSubscriptionStatus } from "@/lib/subscription";
import { authenticateExtension } from "@/lib/extension-auth";

const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * Expected JSON body:
 * {
 *   "to": "prospect@company.com",
 *   "subject": "Re: ...",
 *   "body": "plain text body (we'll enhance if meeting intent)",
 *   "from": process.env.RESEND_FROM (server will set if omitted)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, from } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json({ error: "Missing to/subject/body" }, { status: 400 });
    }

    // 1) Try normal cookie auth (user in browser)
    const { userId: cookieUser } = await getSubscriptionStatus();

    // 2) Else try extension token
    const tokenUser = await authenticateExtension(req);
    const userId = cookieUser || tokenUser;
    
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let text = body as string;
    const attachments: Array<{ filename: string; content: string; contentType: string }> = [];

    // Auto-insert Calendly + ICS if intent detected
    if (wantsMeeting(text)) {
      const start = new Date(Date.now() + 48 * 3600 * 1000); // 2 days out
      const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 mins

      const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;
      if (calendly) {
        text += `\n\nBook a time here: ${calendly}`;
      }

      const ics = buildSimpleICS({
        title: "Intro Call – SmartSendAI",
        description: "Looking forward to chatting!",
        url: calendly || "",
        start,
        end,
        organizer: "mailto:" + (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@yourdomain.com"),
      });

      attachments.push({
        filename: "SmartSendAI-Intro-Call.ics",
        content: ics,
        contentType: "text/calendar; method=PUBLISH",
      });

      // Small nudge line so it's obvious to the recipient
      text += `\n\nI've attached a calendar invite for a 30-min intro.`;
    }

    const fromAddr = from || process.env.RESEND_FROM!;
    const send = await resend.emails.send({
      from: fromAddr,
      to,
      subject,
      text,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    if (send.error) {
      return NextResponse.json({ error: send.error }, { status: 500 });
    }

    // Log AI reply usage for metered billing
    try {
      if (userId) {
        // Get user's team
        const { data: prof } = await supabaseAdmin
          .from("profiles")
          .select("team_id")
          .eq("id", userId)
          .maybeSingle();

        if (prof?.team_id) {
          // Insert the AI reply event first
          const { data: eventData } = await supabaseAdmin.from("ai_reply_events").insert({
            team_id: prof.team_id,
            user_id: userId,
            source: "dashboard",
          }).select().single();

          // Check if team has credits and consume them
          let covered = false;
          if (eventData?.id) {
            const { data: team } = await supabaseAdmin
              .from("teams")
              .select("credit_balance")
              .eq("id", prof.team_id)
              .maybeSingle();

            if ((team?.credit_balance ?? 0) > 0) {
              // Decrement in a single statement to avoid race conditions
              const { data: updated } = await supabaseAdmin
                .rpc("consume_team_credit", { tid: prof.team_id, n: 1 });
              covered = !!updated?.covered;
            }

            // Update the event to mark if it was covered by credits
            await supabaseAdmin
              .from("ai_reply_events")
              .update({ covered_by_credit: covered })
              .eq("id", eventData.id);
          }

          // Increment trial counters if user is trialing
          const { status } = await getSubscriptionStatus();
          if (status === "trialing") {
            await supabaseAdmin.rpc("increment_trial_replies", { uid: userId });
          }
        }
      }
    } catch (usageError) {
      // Don't fail the request if usage logging fails
      console.error('Usage logging error:', usageError);
    }

    // After successful send, learn from the email style
    try {
      if (userId) {
        // 1) Log sample (optional)
        await supabaseAdmin.from("sent_samples").insert({
          user_id: userId,
          to_email: to,
          subject,
          body: text,
        });

        // 2) Update user style
        const sample = extractStyleSample(text);
        const { data: row } = await supabaseAdmin
          .from("user_styles").select("style").eq("user_id", userId).maybeSingle();

        const merged = mergeStyles((row?.style as any) || {}, sample);
        await supabaseAdmin
          .from("user_styles")
          .upsert({ user_id: userId, style: merged, updated_at: new Date().toISOString() });
      }
    } catch (styleError) {
      // Don't fail the request if style learning fails
      console.error('Style learning error:', styleError);
    }

    // Log AI reply activity to HubSpot if connected
    try {
      if (userId && to) {
        // Find team + hubspot token
        const { data: p } = await supabaseAdmin
          .from("profiles")
          .select("team_id, email")
          .eq("id", userId)
          .maybeSingle();
        
        if (p?.team_id) {
          const { getHubspotAuth, findHubspotContact, createHubspotNote } = await import("@/lib/hubspot");
          const auth = await getHubspotAuth(p.team_id);

          if (auth) {
            // Find contact by email in HubSpot
            const contactId = await findHubspotContact(auth.token, to);

            if (contactId) {
              // Create note activity with link back to your app
              await createHubspotNote(
                auth.token,
                contactId,
                subject,
                text,
                process.env.NEXT_PUBLIC_SITE_URL || "https://smartsend.ai"
              );
            }
          }
        }
      }
    } catch (hubspotError) {
      // Don't fail the request if HubSpot logging fails
      console.error('HubSpot activity logging error:', hubspotError);
    }

    return NextResponse.json({ ok: true, id: send.data?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to send" }, { status: 500 });
  }
} 