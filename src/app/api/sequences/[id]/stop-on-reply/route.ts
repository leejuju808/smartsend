import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

function getUserId(req: Request) { return new URL(req.url).searchParams.get("userId"); }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { value } = await req.json().catch(()=> ({}));

  const { error } = await supabaseAdmin
    .from("sequences").update({ stop_on_reply: !!value }).eq("id", params.id).eq("owner", userId);

  if (error) return NextResponse.json({ error: String(error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}

