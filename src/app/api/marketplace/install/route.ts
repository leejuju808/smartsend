import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// helper: create local sequence from payload
async function materializeSequence(payload: any) {
  const { data: seq, error: e1 } = await sb
    .from("sequences")
    .insert({ name: payload.name })
    .select()
    .single();
  if (e1) throw e1;
  
  for (const [i, step] of (payload.steps || []).entries()) {
    await sb.from("sequence_steps").insert({
      sequence_id: seq.id,
      step_order: i + 1,
      subject: step.subject,
      body_text: step.body_text || null,
      body_html: step.body_html || null,
      delay_days: step.delay_days ?? 0,
      condition: step.condition || "always"
    });
  }
  return seq.id;
}

// helper: create local campaign from payload
async function materializeCampaign(payload: any) {
  const { data: camp, error: e1 } = await sb
    .from("campaigns")
    .insert({
      title: payload.name,
      subject: payload.subject,
      body: payload.body_text || payload.body_html || "",
      status: "scheduled"
    })
    .select()
    .single();
  if (e1) throw e1;
  return camp.id;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { template_id, user_id } = body;
  
  if (!template_id || !user_id) {
    return NextResponse.json({ error: "missing params" }, { status: 400 });
  }

  const { data: tpl, error } = await sb
    .from("marketplace_templates")
    .select("*")
    .eq("id", template_id)
    .maybeSingle();
    
  if (error || !tpl) {
    return NextResponse.json({ error: error?.message || "not found" }, { status: 404 });
  }

  // Check entitlement for premium templates
  if (tpl.is_paid) {
    const { data: entitlement } = await sb
      .from("marketplace_entitlements")
      .select("id")
      .eq("user_id", user_id)
      .eq("template_id", template_id)
      .maybeSingle();
    
    if (!entitlement) {
      return NextResponse.json({ 
        error: "purchase_required", 
        message: "This is a premium template. Please purchase it first.",
        template_id,
        is_paid: true,
        redirect: "/pricing"
      }, { status: 402 });
    }
  }

  // Get user's org
  const { data: profile } = await sb
    .from("profiles")
    .select("org_id")
    .eq("id", user_id)
    .single();

  const org_id = profile?.org_id;

  let installed_ref: string | null = null;
  if (tpl.kind === "sequence") {
    installed_ref = await materializeSequence(tpl.payload);
  }
  if (tpl.kind === "campaign") {
    installed_ref = await materializeCampaign(tpl.payload);
  }

  await sb.from("marketplace_installs").insert({
    template_id,
    org_id,
    user_id,
    installed_kind: tpl.kind,
    installed_ref
  });

  // increment installs
  await sb
    .from("marketplace_templates")
    .update({ installs: (tpl.installs || 0) + 1 })
    .eq("id", template_id);

  // Create download URL for the template JSON
  const download_url = `/api/marketplace/download/${template_id}`;

  return NextResponse.json({ 
    ok: true, 
    installed_ref,
    download_url,
    message: "Template installed successfully!"
  });
} 