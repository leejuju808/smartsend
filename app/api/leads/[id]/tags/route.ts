import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("lead_tag_links")
    .select("id, tag:lead_tags(*)")
    .eq("lead_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ tags: data });
}










