import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { contact_emails, sequence_name, template_id } = await req.json();
    if (!Array.isArray(contact_emails) || !contact_emails.length) {
      return NextResponse.json({ ok: false, error: "contact_emails required" }, { status: 400 });
    }
    const sb = supabaseService();
    const user_id = crypto.randomUUID(); // TODO: replace with auth

    // load template (optional)
    let tpl: { subject: string; body: string } | null = null;
    if (template_id) {
      const { data, error } = await sb
        .from("templates")
        .select("subject,body")
        .eq("id", template_id)
        .limit(1);
      if (error) throw error;
      tpl = data?.[0] || null;
    } else {
      // fallback to default template if exists
      const { data } = await sb
        .from("templates")
        .select("subject,body")
        .eq("user_id", user_id)
        .eq("is_default", true)
        .limit(1);
      tpl = data?.[0] || null;
    }

    // Create sequence (active)
    const { data: seq, error: e1 } = await sb
      .from("email_sequences")
      .insert({ user_id, name: sequence_name || "Bulk Sequence", status: "active" })
      .select()
      .single();
    if (e1) throw e1;

    // Steps (use template for step 1 if provided)
    const stepsPayload = [
      {
        sequence_id: seq.id,
        step_no: 1,
        template_subject: tpl?.subject || "Quick idea for {{company|your team}}",
        template_body: tpl?.body || "Hey {{first_name|there}},\nShort note about SmartSend helping reply faster.",
        delay_minutes: 0,
      },
      {
        sequence_id: seq.id,
        step_no: 2,
        template_subject: "Following up on SmartSend",
        template_body: "Bumping this — want a 2-min demo?",
        delay_minutes: 30,
      },
    ];
    const { data: steps, error: e2 } = await sb.from("sequence_steps_new").insert(stepsPayload).select();
    if (e2) throw e2;

    const now = new Date();
    const jobs = [];
    for (const email of contact_emails) {
      for (const s of steps.sort((a: any, b: any) => a.step_no - b.step_no)) {
        const runAt = new Date(now.getTime() + s.delay_minutes * 60 * 1000);
        jobs.push({
          sequence_id: seq.id,
          step_id: s.id,
          contact_email: email,
          run_at: runAt.toISOString(),
          status: "queued",
        });
      }
    }
    const { error: e3 } = await sb.from("sequence_jobs").insert(jobs);
    if (e3) throw e3;

    return NextResponse.json({ ok: true, sequence_id: seq.id, jobs_count: jobs.length });
  } catch (e: any) {
    console.error("SCHEDULE_MANY_ERROR", e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}