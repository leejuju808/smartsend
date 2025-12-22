import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

export async function GET() {
  const supabase = createClient();
  await setAccountContext(supabase);

  const { data, error } = await supabase
    .from("event_log")
    .select("created_at, kind, message, context")
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ rows: data ?? [] });
}



