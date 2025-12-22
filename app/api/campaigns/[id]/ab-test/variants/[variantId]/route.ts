import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; variantId: string } }
) {
  const supabase = createClient();
  const variantId = params.variantId;

  try {
    const { data: variant, error } = await supabase
      .from("ab_variants")
      .select("*")
      .eq("id", variantId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(variant);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; variantId: string } }
) {
  const supabase = createClient();
  const variantId = params.variantId;

  try {
    const body = await req.json();
    const { variant_label, subject, body: bodyText, persona_id } = body;

    const updateData: any = {};
    if (variant_label !== undefined) updateData.variant_label = variant_label.toUpperCase();
    if (subject !== undefined) updateData.subject = subject;
    if (bodyText !== undefined) updateData.body = bodyText;
    if (persona_id !== undefined) updateData.persona_id = persona_id;

    const { data: variant, error } = await supabase
      .from("ab_variants")
      .update(updateData)
      .eq("id", variantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(variant);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; variantId: string } }
) {
  const supabase = createClient();
  const variantId = params.variantId;

  try {
    const { error } = await supabase
      .from("ab_variants")
      .delete()
      .eq("id", variantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}



























