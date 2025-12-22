import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; collabId: string } }
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("campaign_collaborators")
    .delete()
    .eq("id", params.collabId);

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ ok: true }, { status: 200 });
}








