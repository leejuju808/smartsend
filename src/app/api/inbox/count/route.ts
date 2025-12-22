import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getServerSupabase();
  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("status", "replied")
    .eq("inbox_archived", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}

