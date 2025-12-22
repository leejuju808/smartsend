import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const { error } = await supabase
    .from("enrichment_jobs")
    .update({ next_run_at: new Date().toISOString() })
    .eq("status", "failed");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}



