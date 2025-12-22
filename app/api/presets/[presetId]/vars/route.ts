import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Upsert = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid().optional(),
      var_name: z.string().min(1),
      lead_path: z.string().min(1),
      fallback: z.string().optional().nullable(),
    }),
  ),
});

export async function GET(_: NextRequest, { params }: { params: { presetId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("rewrite_var_mappings")
    .select("id,created_at,var_name,lead_path,fallback")
    .eq("preset_id", params.presetId)
    .order("var_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mappings: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { presetId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Upsert.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: preset, error: presetError } = await supabase
    .from("rewrite_presets")
    .select("id,user_id,campaign_id")
    .eq("id", params.presetId)
    .single();

  if (presetError || !preset) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  const rows = parsed.data.items.map((item) => ({
    ...item,
    preset_id: params.presetId,
  }));

  const withId = rows.filter((r) => r.id);
  const withoutId = rows.filter((r) => !r.id);

  if (withId.length) {
    const { error } = await supabase
      .from("rewrite_var_mappings")
      .upsert(withId as any, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (withoutId.length) {
    const { error } = await supabase
      .from("rewrite_var_mappings")
      .upsert(withoutId as any, { onConflict: "preset_id,var_name" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { presetId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("rewrite_var_mappings")
    .delete()
    .eq("id", id)
    .eq("preset_id", params.presetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

