import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabaseServer";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = serverClient();
  const { error } = await supabase.rpc("archive_campaign", {
    p_campaign: params.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

