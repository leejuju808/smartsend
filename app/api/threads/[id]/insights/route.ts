import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: insight } = await supa
    .from("thread_insights")
    .select("*")
    .eq("thread_id", params.id)
    .maybeSingle();

  const { data: objections } = await supa
    .from("thread_objections")
    .select("*")
    .eq("thread_id", params.id);

  return NextResponse.json({ ok: true, insight, objections });
}

