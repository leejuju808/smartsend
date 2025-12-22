import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { templateId, label, text, userId, settings } = await req.json();
    if (!templateId || !text || !userId) {
      return NextResponse.json({ error: "templateId, text, userId required" }, { status: 400 });
    }

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("template_versions")
      .insert({ template_id: templateId, label: label ?? null, text, settings: settings ?? null, created_by: userId })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Save failed" }, { status: 500 });
  }
}


