import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const q = new URL(req.url).searchParams.get("q") ?? "";

  const { data, error } = await supabase.rpc("suggest_tech_stack", {
    p_prefix: q,
    p_limit: 12,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ items: data ?? [] });
}

