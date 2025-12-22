import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { basicTemplate } from "@/lib/templates/basic";

// IMPORTANT: use Node runtime (not Edge) for SendGrid SDK
export const runtime = "nodejs";

export async function GET() {
  const nowIso = new Date().toISOString();

  // Pull a batch
  const { data: jobs, error } = await supabaseAdmin
    .from("send_jobs")
    .select("id, user_id, to_email, subject, body")
    .eq("status", "queued")
    .lte("run_at", nowIso)
    .limit(40);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!jobs?.length) return NextResponse.json({ ok: true, processed: 0 });

  let processed = 0;

  for (const j of jobs) {
    try {
      await supabaseAdmin.from("send_jobs").update({ status: "sending" }).eq("id", j.id);

      // personalize basic template
      const unsubscribeUrl = `${process.env.SMARTSEND_UNSUB_BASE}?e=${encodeURIComponent(j.to_email)}`;
      const html = basicTemplate({
        headline: j.subject,
        body: j.body.replace(/\n/g, "<br/>"),
        unsubscribeUrl,
        ctaText: undefined,
        ctaUrl: undefined,
      });

      const res = await sendEmail({
        to: j.to_email,
        subject: j.subject,
        html,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      });

      if (res.ok) {
        await supabaseAdmin
          .from("send_jobs")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", j.id);
        processed++;
      } else {
        await supabaseAdmin
          .from("send_jobs")
          .update({ status: "failed" })
          .eq("id", j.id);
      }
    } catch (e) {
      await supabaseAdmin.from("send_jobs").update({ status: "failed" }).eq("id", j.id);
    }
  }

  return NextResponse.json({ ok: true, processed });
}