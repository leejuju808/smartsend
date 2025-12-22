import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { steps } = await req.json();
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const rows = (steps || []).map((x: any) => ({
    ...x,
    campaign_id: params.id,
    subject_template: x.subject_template || "",
    body_template: x.body_template || "",
    delay_days: x.delay_days ?? 0,
    active: x.active !== false
  }));
  
  // Get old step values for audit log
  const { data: oldSteps } = await supabase
    .from("campaign_steps")
    .select("id, step_no, subject_template, body_template")
    .eq("campaign_id", params.id);

  const { error } = await supabase
    .from("campaign_steps")
    .upsert(rows, { onConflict: "campaign_id,step_no" });
  
  if (error) {
    return NextResponse.json({ ok: false, error: error.message });
  }

  // Log audit events for each step that changed
  for (const step of rows) {
    const oldStep = oldSteps?.find(s => s.step_no === step.step_no);
    const fields: string[] = [];
    const meta: any = { step_no: step.step_no };
    
    if (!oldStep || oldStep.subject_template !== step.subject_template) {
      fields.push("subject");
      meta.subject_chars_before = oldStep?.subject_template?.length || 0;
      meta.subject_chars_after = step.subject_template?.length || 0;
    }
    
    if (!oldStep || oldStep.body_template !== step.body_template) {
      fields.push("body");
      meta.body_chars_before = oldStep?.body_template?.length || 0;
      meta.body_chars_after = step.body_template?.length || 0;
    }

    if (fields.length > 0) {
      await supabase.rpc("log_audit", {
        p_actor: user.id,
        p_campaign: params.id,
        p_entity_type: "template",
        p_entity: oldStep?.id || null,
        p_action: "edit_template",
        p_meta: { fields, ...meta }
      });
    }
  }
  
  return NextResponse.json({ ok: true });
}
