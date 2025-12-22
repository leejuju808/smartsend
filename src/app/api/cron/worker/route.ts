import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withTracking } from "@/lib/tracking";
import { loadSendWindowFor } from "@/lib/sendSettings";
import { clampToWindow } from "@/lib/sendWindow";

export const runtime = "edge";

export async function GET() {
  const nowIso = new Date().toISOString();

  // grab up to 50 queued jobs that are due
  const { data: jobs, error } = await supabaseAdmin
    .from("send_jobs")
    .select("id, to_email, subject, body, enrollment_id, org_id")
    .eq("status", "queued")
    .lte("run_at", nowIso)
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!jobs?.length) return NextResponse.json({ ok: true, processed: 0 });

  let processed = 0;

  for (const j of jobs) {
    // Check send window before processing
    const { data: enroll } = await supabaseAdmin
      .from("sequence_enrollments")
      .select("id, org_id, send_tz, send_window_start, send_window_end, send_weekdays")
      .eq("id", j.enrollment_id)
      .maybeSingle();

    const win = await loadSendWindowFor(j.org_id, enroll || undefined);
    const nowClamped = clampToWindow(nowIso, win);

    // If nowClamped is in the future, defer this job
    if (new Date(nowClamped).getTime() > Date.now()) {
      await supabaseAdmin.from("send_jobs")
        .update({ run_at: nowClamped, status: "queued" })
        .eq("id", j.id);
      continue; // skip sending now
    }

    // mark sending
    await supabaseAdmin.from("send_jobs").update({ status: "sending" }).eq("id", j.id);

    try {
      // Apply tracking to the email body
      const trackedHtml = withTracking(j.body, j.id);
      
      // TODO: integrate real SMTP/SendGrid here
      // await sendEmail({
      //   to: j.to_email,
      //   subject: j.subject,
      //   html: trackedHtml,
      //   headers: {
      //     "List-Unsubscribe": `<${unsubscribeUrl}>`,
      //     "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      //     "Reply-To": replyAddress
      //   },
      // });

      // For now, simulate success:
      await new Promise((r) => setTimeout(r, 50));

      await supabaseAdmin.from("send_jobs")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", j.id);
      processed++;
    } catch (e) {
      await supabaseAdmin.from("send_jobs")
        .update({ status: "failed" })
        .eq("id", j.id);
    }
  }

  return NextResponse.json({ ok: true, processed });
}