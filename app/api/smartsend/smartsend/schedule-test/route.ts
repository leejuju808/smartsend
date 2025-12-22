import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { contact_email, name } = await req.json();
    if (!contact_email) return NextResponse.json({ ok: false, error: "contact_email required" }, { status: 400 });

    const sb = supabaseService();

    // In a real app, user_id comes from auth. For now, a placeholder UUID works for testing.
    const user_id = crypto.randomUUID();

    // 1) Create sequence (active)
    const { data: seq, error: e1 } = await sb
      .from("email_sequences")
      .insert({ user_id, name: name || "Demo Sequence", status: "active" })
      .select()
      .single();
    if (e1) throw e1;

    // 2) Create 2 demo steps
    const stepsPayload = [
      {
        sequence_id: seq.id,
        step_no: 1,
        template_subject: "Quick idea for {{company}}",
        template_body: "Hey there — short note about improving your lead response with SmartSend.",
        delay_minutes: 0
      },
      {
        sequence_id: seq.id,
        step_no: 2,
        template_subject: "Following up on SmartSend",
        template_body: "Bumping this — want me to show you a 2-min demo?",
        delay_minutes: 30
      }
    ];
    const { data: steps, error: e2 } = await sb
      .from("sequence_steps_new")
      .insert(stepsPayload)
      .select();
    if (e2) throw e2;

    // 3) Create jobs for contact
    const now = new Date();
    const jobs = steps
      .sort((a: any, b: any) => a.step_no - b.step_no)
      .map((s: any) => {
        const runAt = new Date(now.getTime() + s.delay_minutes * 60 * 1000);
        return {
          sequence_id: seq.id,
          step_id: s.id,
          contact_email,
          run_at: runAt.toISOString(),
          status: "queued",
        };
      });

    const { error: e3 } = await sb.from("sequence_jobs").insert(jobs);
    if (e3) throw e3;

    return NextResponse.json({ ok: true, sequence_id: seq.id, jobs });
  } catch (e: any) {
    console.error("SCHEDULE_TEST_ERROR", e);
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}