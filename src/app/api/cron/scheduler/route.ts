import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadSendWindowFor } from "@/lib/sendSettings";
import { clampToWindow } from "@/lib/sendWindow";

export const runtime = "edge";

export async function GET() {
  const nowIso = new Date().toISOString();

  // 1) find enrollments due now
  // Block 302: Only process 'active' enrollments (excludes stopped_due_to_reply, stopped_due_to_unsubscribe, etc.)
  const { data: due, error } = await supabaseAdmin
    .from("sequence_enrollments")
    .select("id,user_id,sequence_id,lead_id,next_step_order,org_id,send_tz,send_window_start,send_window_end,send_weekdays")
    .lte("next_run_at", nowIso)
    .eq("status", "active") // ONLY active enrollments send
    .limit(100); // batch

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ ok: true, promoted: 0 });

  let promoted = 0;

  for (const e of due) {
    // fetch step content
    const { data: step } = await supabaseAdmin
      .from("sequence_steps")
      .select("id,subject,body,delay_hours,step_order")
      .eq("sequence_id", e.sequence_id)
      .eq("step_order", e.next_step_order)
      .maybeSingle();

    if (!step) {
      // no step: mark enrollment as completed
      await supabaseAdmin.from("sequence_enrollments").update({ status: "completed", next_run_at: null }).eq("id", e.id);
      continue;
    }

    // get lead email and check status
    // Block 302: Check both status and replied flag
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("email,status,replied")
      .eq("id", e.lead_id)
      .maybeSingle();
    if (!lead?.email) continue;
    
    // skip if lead has replied (check both status field and replied boolean)
    if (lead.status === "Replied" || lead.replied === true) {
      console.log(`Skipping follow-up for lead ${e.lead_id}: already replied.`);
      continue;
    }

    // Double-check enrollment is still active (safeguard before sending)
    // Block 302: Ensure enrollment hasn't been stopped due to reply/unsubscribe
    const { data: enrollment } = await supabaseAdmin
      .from("sequence_enrollments")
      .select("status")
      .eq("id", e.id)
      .maybeSingle();
    
    if (!enrollment || enrollment.status !== "active") {
      console.log(`Skipping enrollment ${e.id}: status is ${enrollment?.status || "not found"}`);
      continue;
    }

    // create send job
    await supabaseAdmin.from("send_jobs").insert({
      user_id: e.user_id,
      enrollment_id: e.id,
      sequence_id: e.sequence_id,
      step_id: step.id,
      to_email: lead.email,
      subject: step.subject,
      body: step.body,
      run_at: nowIso,
      status: "queued"
    });

    // schedule next step (if exists)
    const { data: nextStep } = await supabaseAdmin
      .from("sequence_steps")
      .select("step_order, delay_hours")
      .eq("sequence_id", e.sequence_id)
      .gt("step_order", step.step_order)
      .order("step_order")
      .limit(1)
      .maybeSingle();

    if (nextStep) {
      const nextAt = new Date(Date.now() + (nextStep.delay_hours ?? 0) * 3600 * 1000).toISOString();
      
      // Clamp next run time to send window
      const win = await loadSendWindowFor(e.org_id, {
        send_tz: e.send_tz,
        send_window_start: e.send_window_start,
        send_window_end: e.send_window_end,
        send_weekdays: e.send_weekdays,
      });
      const nextAtClamped = clampToWindow(nextAt, win);
      
      await supabaseAdmin
        .from("sequence_enrollments")
        .update({ next_step_order: nextStep.step_order, next_run_at: nextAtClamped })
        .eq("id", e.id);
    } else {
      await supabaseAdmin
        .from("sequence_enrollments")
        .update({ status: "completed", next_run_at: null })
        .eq("id", e.id);
    }

    promoted++;
  }

  return NextResponse.json({ ok: true, promoted });
}