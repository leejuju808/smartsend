import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServer();
  const [{ count: replied }, { count: total }] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }).eq("status","Replied"),
    supabase.from("leads").select("*", { count: "exact", head: true }),
  ]);
  return NextResponse.json({ replied, total, notReplied: (total||0)-(replied||0) });
}

