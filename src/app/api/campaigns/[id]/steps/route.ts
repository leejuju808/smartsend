import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb.from("campaign_steps")
    .select("*").eq("campaign_id", params.id).order("step_no", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ steps: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json(); // { step_no, enabled, offset_days, subject_template, body_html_template, send_start, send_end, has_variants, id, enable_variant, subject_b, body_html_template_b, variant_split, followup_enabled, followup_delay_days, followup_condition, followup_subject_template, followup_body_template }
  const row = { ...body, campaign_id: params.id };
  
  // If has_variants is being set to false, ensure it's explicitly set
  if (body.has_variants === false) {
    row.has_variants = false;
  }
  
  // Block 11600: Handle A/B testing variant fields
  // If enable_variant is false, clear variant fields
  if (body.enable_variant === false) {
    row.enable_variant = false;
    row.subject_b = null;
    row.body_html_template_b = null;
  } else if (body.enable_variant === true) {
    row.enable_variant = true;
    // Ensure variant_split is between 0 and 100
    if (body.variant_split !== undefined) {
      row.variant_split = Math.max(0, Math.min(100, parseInt(body.variant_split) || 50));
    } else {
      row.variant_split = 50; // Default 50/50 split
    }
  }
  
  // Block 14300: Handle Auto Follow-up fields
  // If followup_enabled is false, clear follow-up fields
  if (body.followup_enabled === false) {
    row.followup_enabled = false;
    row.followup_subject_template = null;
    row.followup_body_template = null;
  } else if (body.followup_enabled === true) {
    row.followup_enabled = true;
    // Ensure followup_delay_days is at least 1
    if (body.followup_delay_days !== undefined) {
      row.followup_delay_days = Math.max(1, parseInt(body.followup_delay_days) || 3);
    } else {
      row.followup_delay_days = 3; // Default 3 days
    }
    // Ensure followup_condition is valid
    if (body.followup_condition && !['no_reply', 'no_hot_or_warm', 'always'].includes(body.followup_condition)) {
      row.followup_condition = 'no_reply'; // Default to no_reply
    }
  }
  
  // Block 15400: Handle AI Personalization fields
  if (body.ai_personalization_enabled !== undefined) {
    row.ai_personalization_enabled = Boolean(body.ai_personalization_enabled);
    if (body.ai_personalization_enabled) {
      row.ai_personalization_mode = body.ai_personalization_mode || 'opener_only';
    } else {
      row.ai_personalization_mode = null;
    }
  }
  
  const { data, error } = await sb.from("campaign_steps")
    .upsert(row, { onConflict: body.id ? "id" : "campaign_id,step_no" })
    .select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, step: data });
}
