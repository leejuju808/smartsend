// supabase/functions/process_queue/index.ts
// Deploy: supabase functions deploy process_queue --no-verify-jwt (cron)
// If you want auth on webhook, leave verify enabled and add a header check.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, supabaseServiceRoleKey);

// TODO: swap with your real provider (Resend, SendGrid, AWS SES, Mailgun)
async function sendEmail({
  to,
  subject,
  html,
}: { to: string; subject: string; html: string }) {
  // placeholder: log only (won't actually send)
  console.log("SEND →", to, subject);
  // simulate provider id
  return { provider_id: crypto.randomUUID() };
}

Deno.serve(async () => {
  // 1) lock a small batch of due jobs
  const { data: due, error } = await sb.rpc("lock_due_email_jobs", {
    p_limit: 50,
  });
  if (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error }), { status: 500 });
  }
  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }));
  }

  let success = 0, failed = 0;

  for (const job of due as any[]) {
    try {
      const res = await sendEmail({
        to: job.to_email,
        subject: job.subject,
        html: job.body_html,
      });

      // mark sent + create send record
      const { error: upErr } = await sb
        .from("email_jobs")
        .update({ status: "sent", sent_at: new Date() })
        .eq("id", job.id);
      if (upErr) throw upErr;

      await sb.from("email_sends").insert({
        job_id: job.id,
        provider_id: res.provider_id,
      });

      success++;
    } catch (e) {
      console.error("job failed", job.id, e);
      await sb
        .from("email_jobs")
        .update({ status: "failed", last_error: String(e) })
        .eq("id", job.id);
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, success, failed }));
});