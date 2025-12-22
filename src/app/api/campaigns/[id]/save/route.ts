import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get old values for audit log
  const { data: oldCampaign } = await supabase
    .from("campaigns")
    .select("subject_template, body_template")
    .eq("id", params.id)
    .single();

  const { error } = await supabase.from("campaigns").update({
    subject_template: body.subject_template,
    body_template: body.body_template,
    updated_at: new Date().toISOString()
  }).eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log audit event
  const fields: string[] = [];
  const meta: any = {};
  
  if (oldCampaign?.subject_template !== body.subject_template) {
    fields.push("subject");
    meta.subject_chars_before = oldCampaign?.subject_template?.length || 0;
    meta.subject_chars_after = body.subject_template?.length || 0;
  }
  
  if (oldCampaign?.body_template !== body.body_template) {
    fields.push("body");
    meta.body_chars_before = oldCampaign?.body_template?.length || 0;
    meta.body_chars_after = body.body_template?.length || 0;
  }

  if (fields.length > 0) {
    await supabase.rpc("log_audit", {
      p_actor: user.id,
      p_campaign: params.id,
      p_entity_type: "campaign",
      p_entity: params.id,
      p_action: "edit_template",
      p_meta: { fields, ...meta }
    });
  }
  
  return NextResponse.json({ ok: true });
}

