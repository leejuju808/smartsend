import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST!,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: false,
  auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
});

export async function POST(req: Request) {
  try {
    const { data: steps, error: stepsError } = await supabase
      .from("sequence_steps")
      .select("*");
    if (stepsError) throw stepsError;

    for (const step of steps || []) {
      const { data: assigned, error: assignedError } = await supabase
        .from("campaign_contacts")
        .select("id, sent_at, contacts(email)")
        .eq("campaign_id", step.campaign_id);
      if (assignedError) throw assignedError;

      for (const a of assigned || []) {
        const { count: replyCount, error: replyErr } = await supabase
          .from("email_replies")
          .select("*", { count: "exact", head: true })
          .eq("campaign_contact_id", a.id);
        if (replyErr) throw replyErr;
        if (replyCount && replyCount > 0) continue;

        const { count: already, error: alreadyErr } = await supabase
          .from("email_clicks")
          .select("*", { count: "exact", head: true })
          .eq("campaign_contact_id", a.id)
          .eq("url", `step-${step.id}`);
        if (alreadyErr) throw alreadyErr;
        if (already && already > 0) continue;

        if (!a.sent_at) continue;
        const sentDate = new Date(a.sent_at as string);
        const targetDate = new Date(sentDate);
        targetDate.setDate(targetDate.getDate() + (step.delay_days as number));

        if (new Date() >= targetDate) {
          await transporter.sendMail({
            from: `"SmartSendAI" <${process.env.SMTP_USER!}>`,
            to: (a as any).contacts.email,
            subject: step.subject as string,
            text: step.body as string,
          });

          const { error: logErr } = await supabase.from("email_clicks").insert([
            { campaign_contact_id: a.id, url: `step-${step.id}` },
          ]);
          if (logErr) throw logErr;

          // Mark last step sent and sent_at for this follow-up
          await supabase
            .from("campaign_contacts")
            .update({ sent_at: new Date().toISOString(), last_step_sent: (step as any).step_number ?? 2 })
            .eq("id", a.id as string);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Follow-up send error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
} 