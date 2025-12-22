import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const runtime = "nodejs";

/**
 * Body:
 * {
 *   step_id: uuid,
 *   variant_key: string ('A', 'B', 'C', etc.),
 *   subject?: string,
 *   body?: string,
 *   delay_hours?: number,
 * }
 */
export async function POST(req: Request) {
  try {
    const { step_id, variant_key, subject, body, delay_hours } = await req.json();

    if (!step_id || !variant_key) {
      return NextResponse.json(
        { error: "step_id and variant_key are required" },
        { status: 400 }
      );
    }

    const sb = createClient(url, service, { auth: { persistSession: false } });

    // Get base step to use defaults if not provided
    const { data: baseStep } = await sb
      .from("campaign_steps")
      .select("*")
      .eq("id", step_id)
      .single();

    if (!baseStep) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    const { data, error } = await sb
      .from("campaign_step_variants")
      .insert({
        step_id,
        variant_key,
        subject: subject ?? baseStep.subject ?? baseStep.subject_template ?? "",
        body: body ?? baseStep.body ?? baseStep.body_html_template ?? baseStep.body_html ?? "",
        delay_hours: delay_hours ?? baseStep.delay_hours ?? (baseStep.offset_days ? baseStep.offset_days * 24 : null),
      })
      .select()
      .single();

    if (error) {
      // Check if it's a unique constraint violation
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Variant ${variant_key} already exists for this step` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Add variant failed" }, { status: 500 });
  }
}



