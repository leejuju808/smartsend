import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const supa = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supa
    .from("meeting_drafts")
    .select("*")
    .eq("thread_id", params.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draft: data });
}

