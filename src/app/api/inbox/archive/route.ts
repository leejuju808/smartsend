import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { lead_id } = await req.json();
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("leads")
    .update({ inbox_archived: true })
    .eq("id", lead_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

