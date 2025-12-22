import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type Body = {
  preset_id?: string;
  name?: string;
  weight?: number;
  subject?: string | null;
  body_html?: string | null;
  body_text?: string | null;
  status?: "active" | "paused";
};

function invalidUuid(value: unknown): boolean {
  return typeof value !== "string" || !value.match(/^[0-9a-fA-F-]{36}$/);
}

function clampWeight(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.max(0, Math.min(1, num));
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as Body | null;

  const presetId = payload?.preset_id;
  const name = payload?.name;
  const weight = clampWeight(payload?.weight ?? 0.5);
  const subject = payload?.subject ?? null;
  const bodyHtml = payload?.body_html ?? null;
  const bodyText = payload?.body_text ?? null;
  const status = payload?.status ?? "active";

  if (!presetId || invalidUuid(presetId)) {
    return NextResponse.json({ ok: false, error: "invalid_preset_id" }, { status: 400 });
  }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, error: "invalid_name" }, { status: 400 });
  }

  if (status !== "active" && status !== "paused") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("nudge_preset_variants")
    .insert({
      preset_id: presetId,
      name,
      weight,
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      status,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, variant: data });
}

