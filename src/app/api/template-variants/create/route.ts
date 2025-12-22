import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { template_id, variant } = await req.json();

    if (!template_id || !variant) {
      return NextResponse.json({ error: "template_id and variant required" }, { status: 400 });
    }

    // Verify template ownership
    const { data: template, error: templateError } = await supabase
      .from("email_templates")
      .select("id, user_id")
      .eq("id", template_id)
      .eq("user_id", user.id)
      .single();

    if (templateError || !template) {
      return NextResponse.json({ error: "Template not found or unauthorized" }, { status: 404 });
    }

    // Insert variant
    const { error: insertError } = await supabase
      .from("template_variants")
      .insert({
        template_id,
        variant_label: variant.label || "Generated Variant",
        subject: variant.subject,
        body: variant.body,
        meta: { score: variant.score ?? null, tone: variant.tone ?? null, len: variant.len ?? null }
      });

    if (insertError) {
      console.error("Failed to insert variant:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("Variant creation error:", e);
    return NextResponse.json({ error: e.message || "Failed to create variant" }, { status: 500 });
  }
}

