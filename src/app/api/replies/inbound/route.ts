import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const inReplyTo = (body.in_reply_to || body["in-reply-to"] || "").trim();
  const references: string[] = Array.isArray(body.references)
    ? body.references
    : String(body.references || "").split(/\s+/).filter(Boolean);

  if (!inReplyTo && references.length === 0) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  // Try In-Reply-To first
  if (inReplyTo) {
    const { data } = await supabaseAdmin
      .from("outbound_messages")
      .select("id, owner, lead_id")
      .eq("message_id", inReplyTo)
      .maybeSingle();
    if (data) return await markReplied((data as any).id, body.message_id || null);
  }

  // Fallback to References list
  for (const ref of references) {
    const { data } = await supabaseAdmin
      .from("outbound_messages")
      .select("id, owner, lead_id")
      .eq("message_id", ref.trim())
      .maybeSingle();
    if (data) return await markReplied((data as any).id, body.message_id || null);
  }

  return NextResponse.json({ ok: false, reason: "no_match" }, { status: 404 });
}

async function markReplied(outboundId: string, replyMsgId: string | null) {
  await supabaseAdmin
    .from("outbound_messages")
    .update({ replied: true, reply_message_id: replyMsgId, reply_at: new Date().toISOString() })
    .eq("id", outboundId);
  return NextResponse.json({ ok: true });
}

