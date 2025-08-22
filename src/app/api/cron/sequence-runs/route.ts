import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { sendEmail } from "@/server/email";
import { renderTemplate } from "@/lib/renderTemplate";

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();

  // Pull a batch of candidate runs that are not stopped
  const { data: runs } = await supabaseAdmin
    .from("sequence_runs")
    .select(
      `id, sequence_id, contact_id, current_step, last_sent_at,
       sequences:user_id,
       contacts:contact_id(id,email,name,company)`
    )
    .eq("stopped", false)
    .limit(200);

  if (!runs || runs.length === 0) return NextResponse.json({ ok: true, processed: 0 });

  let processed = 0;

  for (const run of runs as any[]) {
    try {
      // Load the step definition
      const { data: step } = await supabaseAdmin
        .from("sequence_steps")
        .select("id, subject, body, delay_days")
        .eq("sequence_id", run.sequence_id)
        .eq("step_number", run.current_step)
        .maybeSingle();

      if (!step) {
        // No such step -> stop the run
        await supabaseAdmin.from("sequence_runs").update({ stopped: true }).eq("id", run.id);
        continue;
      }

      const delayDays = Number(step.delay_days || 0);
      const last = run.last_sent_at ? new Date(run.last_sent_at) : null;
      const due = !last || (now.getTime() - last.getTime()) >= delayDays * 24 * 60 * 60 * 1000;
      if (!due) continue;

      // Prepare personalized content
      const contact = run.contacts || {};
      const subject = renderTemplate(step.subject || "", contact);
      const html = renderTemplate(step.body || "", contact);

      // Determine owner mailbox from sequences.user_id
      const ownerId = (run as any).sequences as string | undefined;
      if (!ownerId) continue;

      await sendEmail({ owner: ownerId, to: String(contact.email || ""), subject, html, headers: {} });

      // Advance step
      await supabaseAdmin
        .from("sequence_runs")
        .update({ last_sent_at: new Date().toISOString(), current_step: Number(run.current_step || 1) + 1 })
        .eq("id", run.id);

      processed++;
    } catch (e) {
      // Best-effort: skip this run on error
      // eslint-disable-next-line no-console
      console.error("sequence-runs worker error:", e);
    }
  }

  return NextResponse.json({ ok: true, processed });
}

