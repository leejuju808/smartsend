import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  const { outboundId } = await req.json().catch(() => ({} as any));
  if (!outboundId) return NextResponse.json({ error: "missing outboundId" }, { status: 400 });
  await supabaseAdmin
    .from("outbound_messages")
    .update({ replied: true, reply_at: new Date().toISOString() })
    .eq("id", outboundId);
  return NextResponse.json({ ok: true });
}

