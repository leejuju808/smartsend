import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await s
    .from("rewrite_var_mappings")
    .select("var_name,lead_path,fallback")
    .eq("preset_id", params.id)
    .order("var_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const payload = await req.json().catch(() => ({ mappings: [] }));
  const s = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  for (const m of payload.mappings ?? []) {
    await s
      .from("rewrite_var_mappings")
      .upsert({ preset_id: params.id, ...m }, { onConflict: "preset_id,var_name" });
  }

  return NextResponse.json({ ok: true });
}







