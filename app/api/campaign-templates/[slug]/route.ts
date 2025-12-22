import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  const supabase = createClient();

  const { data: template, error: tmplError } = await supabase
    .from("campaign_templates")
    .select("*")
    .eq("slug", params.slug)
    .single();

  if (tmplError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Prefer locked-copy steps if present (template_steps), else fall back to campaign_template_steps.
  const { data: lockedSteps, error: lockedErr } = await supabase
    .from("template_steps")
    .select("id, template_id, step_number, delay_days, subject, body_text, created_at")
    .eq("template_id", template.id)
    .order("step_number", { ascending: true });

  if (!lockedErr && lockedSteps && lockedSteps.length > 0) {
    const mapped = lockedSteps.map((s: any) => ({
      id: s.id,
      template_id: s.template_id,
      step_order: s.step_number,
      delay_days: s.delay_days,
      subject_template: s.subject,
      body_template: s.body_text,
      created_at: s.created_at,
      locked: true,
    }));
    return NextResponse.json({ template: { ...template, locked: true }, steps: mapped });
  }

  const { data: steps, error: stepsError } = await supabase
    .from("campaign_template_steps")
    .select("*")
    .eq("template_id", template.id)
    .order("step_order", { ascending: true });

  if (stepsError) {
    return NextResponse.json({ error: stepsError.message }, { status: 400 });
  }

  return NextResponse.json({ template, steps });
}



























































