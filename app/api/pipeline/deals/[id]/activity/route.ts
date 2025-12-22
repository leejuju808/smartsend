import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;

  const { data: activities, error } = await supabase
    .from("deal_activity")
    .select("*")
    .eq("deal_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ activities: activities || [] });
}









