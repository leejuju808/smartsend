import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ClassifierActionRow = {
  actions: Record<string, unknown> | null;
};

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const supa = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supa
    .from("message_classifications")
    .select("*")
    .eq("message_id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "classification_lookup_failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, row: null, action: null });
  }

  const { data: actionRow } = await supa
    .from("classifier_actions")
    .select("actions")
    .eq("message_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const action = (actionRow as ClassifierActionRow | null)?.actions ?? null;
  return NextResponse.json({ ok: true, row: data, action });
}

