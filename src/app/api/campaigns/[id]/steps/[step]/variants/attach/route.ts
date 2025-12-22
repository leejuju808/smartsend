import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: Request,
  { params }: { params: { id: string; step: string } }
) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();
  const { name, subject, body_html, weight } = body || {};

  if (!name || !subject || !body_html) {
    return new Response("name, subject, body_html required", { status: 400 });
  }

  const { data, error } = await admin.rpc("attach_rewrite_variant", {
    p_campaign: params.id,
    p_step_no: Number(params.step),
    p_name: name,
    p_subject: subject,
    p_body_html: body_html,
    p_weight: weight ?? 0.5,
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return NextResponse.json({ ok: true, variant_id: data });
}












