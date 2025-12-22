import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { message_id } = await req.json();

    if (!message_id) {
      return NextResponse.json({ error: "message_id is required" }, { status: 400 });
    }

    const { data: message, error: messageError } = await supabaseAdmin
      .from("inbox_messages")
      .select("id, subject, body_text, body_html")
      .eq("id", message_id)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const body = message.body_text ?? message.body_html ?? "";

    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc("classify_inbound_reply", {
      p_subject: message.subject,
      p_body: body,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const label = (result?.label as string | undefined) ?? "unknown";
    const confidence = typeof result?.confidence === "number" ? result.confidence : 0;

    const { error: updateError } = await supabaseAdmin
      .from("inbox_messages")
      .update({
        ai_label: label,
        ai_confidence: confidence,
        classified_at: new Date().toISOString(),
      })
      .eq("id", message_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, label, confidence });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Internal error" }, { status: 500 });
  }
}













