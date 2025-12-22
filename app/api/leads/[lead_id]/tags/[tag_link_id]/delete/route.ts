import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(_: Request, { params }: { params: { lead_id: string; tag_link_id: string } }) {
  const supabase = createClient();

  const { error } = await supabase
    .from("lead_tag_links")
    .delete()
    .eq("id", params.tag_link_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}










