import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rewriteWithPreset } from "@/lib/ai/rewrite";
import { rewritePresetConfigSchema } from "@/lib/templates/rewrite-schema";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { presetId, text } = body as { presetId: string; text: string };

    if (!presetId || !text) {
      return NextResponse.json({ error: "Missing presetId or text" }, { status: 400 });
    }

    const supabase = createClient();

    const { data: presetRow, error } = await supabase
      .from("shared_resources")
      .select("config")
      .eq("id", presetId)
      .eq("kind", "rewrite_preset")
      .single();

    if (error || !presetRow) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 });
    }

    const config = rewritePresetConfigSchema.parse(presetRow.config);

    const rewritten = await rewriteWithPreset(text, config);

    return NextResponse.json({
      ok: true,
      rewritten,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error", details: (err as Error).message },
      { status: 500 }
    );
  }
}













