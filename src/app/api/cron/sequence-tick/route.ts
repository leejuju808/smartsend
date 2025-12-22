import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { nextStepInfo, addDays, atFriendlyHour, bumpOutOfQuiet, getProfilePolicy } from "@/server/scheduler";
import { isIana, guessTzFromEmail } from "@/lib/tz";
import { sendStepEmail } from "@/jobs/sender"; // renamed local API
import { sendEmail } from "@/server/email"; // transport wrapper

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowISO = new Date().toISOString();
  // pull a small batch due now
  const { data: due } = await supabaseAdmin
    .from("enrollments")
    .select("id, owner, sequence_id, lead_id, step_no, status, next_send_at")
    .eq("status", "active")
    .lte("next_send_at", nowISO)
    .order("next_send_at", { ascending: true })
    .limit(50);

  if (!due?.length) return NextResponse.json({ ok: true, processed: 0 });

  let processed = 0;

  for (const job of due) {
    // BLOCK 269700: Missed payment => immediate silence. Don't send; just push the clock.
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("subscription_status")
        .eq("id", job.owner)
        .maybeSingle();
      const status = String((prof as any)?.subscription_status || "");
      const isPaid = status === "active" || status === "trialing";
      if (!isPaid) {
        const retryAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
        await supabaseAdmin
          .from("enrollments")
          .update({ next_send_at: retryAt.toISOString() })
          .eq("id", job.id);
        continue;
      }
    } catch {
      const retryAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
      await supabaseAdmin
        .from("enrollments")
        .update({ next_send_at: retryAt.toISOString() })
        .eq("id", job.id);
      continue;
    }

    // ensure sequence is running
    const { data: seq } = await supabaseAdmin.from("sequences")
      .select("status, stop_on_reply").eq("id", job.sequence_id).single();
    if (!seq || seq.status !== "running") {
      await supabaseAdmin.from("enrollments").update({ status: "paused" }).eq("id", job.id);
      continue;
    }

    // load step & policy
    const { cur, nxt } = await nextStepInfo(job.sequence_id, job.step_no);
    if (!cur) {
      // no such step -> complete
      await supabaseAdmin.from("enrollments").update({ status: "completed", next_send_at: null }).eq("id", job.id);
      continue;
    }
    const policy = await getProfilePolicy(job.owner);

    // perform send (uses all previous guards: unsubscribed, replied, suppressed, cap, quiet)
    try {
      const lead = await getLead(job.lead_id);
      const { data: ownerProfile } = await supabaseAdmin.from("profiles").select("email").eq("id", job.owner).single();
      const ownerEmail = ownerProfile?.email || "";
      const res = await sendStepEmail({
        ownerId: job.owner,
        ownerEmail,
        lead,
        sequenceId: job.sequence_id,
        stepNo: job.step_no,
        subject: cur.subject,
        bodyHtml: cur.body,
        transportSend: async (m: { to: string; subject: string; html: string; headers: Record<string,string> }) => { await sendEmail({ owner: job.owner, ...m }); }
      });

      // If skipped for lead-specific reasons, complete the enrollment unless it's a temporary reason handled below
      if ((res as any)?.skipped && ["quiet_hours", "cap_reached"].includes((res as any).reason)) {
        const retryAt = new Date(); retryAt.setUTCMinutes(retryAt.getUTCMinutes() + 30);
        await supabaseAdmin.from("enrollments").update({ next_send_at: retryAt.toISOString() }).eq("id", job.id);
        processed++; continue;
      }
      if ((res as any)?.skipped) {
        await supabaseAdmin.from("enrollments").update({ status: "completed", next_send_at: null }).eq("id", job.id);
        processed++; continue;
      }

      // sent -> schedule next step or complete
      const now = new Date();
      if (!nxt) {
        await supabaseAdmin.from("enrollments").update({
          status: "completed", last_sent_at: now.toISOString(), next_send_at: null
        }).eq("id", job.id);
      } else {
        // next send date: add delay days, place at friendly hour in lead tz, then bump out of owner quiet
        let target = addDays(now, Number(nxt.delay_days || 0));
        const lead = await getLead(job.lead_id);
        const leadTz = (lead as any).tz && isIana((lead as any).tz) ? (lead as any).tz : (guessTzFromEmail((lead as any).email) || policy.tz);
        target = atFriendlyHour(target, leadTz, 10);
        target = bumpOutOfQuiet(target, policy.tz, policy.quietStart, policy.quietEnd);
        await supabaseAdmin.from("enrollments").update({
          step_no: job.step_no + 1,
          last_sent_at: now.toISOString(),
          next_send_at: target.toISOString()
        }).eq("id", job.id);
      }
      processed++;
    } catch (e:any) {
      await supabaseAdmin.from("enrollments").update({
        status: "error",
        error_text: String(e?.message || e)
      }).eq("id", job.id);
    }
  }

  return NextResponse.json({ ok: true, processed });
}

async function getLead(id: string) {
  const { data } = await supabaseAdmin.from("leads").select("id,email,name,company,tz").eq("id", id).single();
  return { id: data!.id, email: data!.email, name: data?.name, company: data?.company, tz: (data as any)?.tz || null };
}

