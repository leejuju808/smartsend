import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { renderTemplate } from "@/lib/template";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Use env SMTP for MVP
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Boolean(process.env.SMTP_SECURE === "true"),
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! } : undefined,
});

async function checkGate(sender_email: string, recipient_email: string, campaign_id?: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-safety/check-and-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sender_email, recipient_email, campaign_id }),
  });
  if (!res.ok) throw new Error("send-safety check failed");
  return res.json();
}

/**
 * POST JSON:
 * {
 *   campaign_id?: "uuid",
 *   batch_size?: 20
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { campaign_id, batch_size = 20 } = await req.json();

    // 1) pull campaign & templates
    const { data: campaign, error: cErr } = await admin
      .from("campaigns")
      .select("id,name,sender_email,subject_template,body_template,status")
      .eq("id", campaign_id)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
    if (campaign.status !== "running") return NextResponse.json({ error: "campaign not running" }, { status: 400 });

    // 2) fetch pending messages (lock by moving to 'sending' quickly)
    const { data: pending, error: pErr } = await admin
      .from("messages")
      .select("id,recipient_email,payload")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .limit(batch_size);

    if (pErr) throw pErr;
    if (!pending?.length) return NextResponse.json({ sent: 0, skipped: 0, failed: 0 });

    // optimistic lock: mark sending
    await admin.from("messages").update({ status: "sending", attempted_at: new Date().toISOString() })
      .in("id", pending.map((m) => m.id));

    let sent = 0, skipped = 0, failed = 0;

    for (const msg of pending) {
      try {
        // 3) gate check (cap/bounce_guard)
        const gate = await checkGate(campaign.sender_email, msg.recipient_email, campaign.id);
        if (!gate.allowed) {
          skipped++;
          await admin.from("messages")
            .update({ status: "skipped", skipped_reason: gate.reason })
            .eq("id", msg.id);
          continue;
        }

        // 4) render subject/body
        const subject = renderTemplate(campaign.subject_template, msg.payload || {});
        const html = renderTemplate(campaign.body_template, msg.payload || {});

        // 5) send
        const mail = await transporter.sendMail({
          from: campaign.sender_email,
          to: msg.recipient_email,
          subject,
          html,
          text: html.replace(/<[^>]+>/g, " "), // naive text fallback
        });

        sent++;
        await admin.from("messages").update({
          status: "sent",
          provider_message_id: mail.messageId || null,
          sent_at: new Date().toISOString(),
        }).eq("id", msg.id);
      } catch (err: any) {
        failed++;
        await admin.from("messages").update({
          status: "failed",
          last_error: err.message?.slice(0, 500) ?? "unknown error",
        }).eq("id", msg.id);
      }
    }

    return NextResponse.json({ sent, skipped, failed });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message ?? "worker failed" }, { status: 500 });
  }
}
