import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  normalized_id: z.string().uuid(),
  ai_label: z.enum([
    "human_reply",
    "question",
    "positive",
    "neutral",
    "negative",
    "ooo",
    "unsubscribe",
    "spam",
    "bounce",
    "other",
  ]),
  confidence: z.number().min(0).max(1).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { normalized_id, ai_label, confidence } = parsed.data;

  const { data: nm, error } = await supabase
    .from("normalized_messages")
    .select("id, linked_thread_id, sent_at, account_id, provider, provider_message_id")
    .eq("id", normalized_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!nm) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { error: u1 } = await supabase
    .from("normalized_messages")
    .update({ ai_label, ai_confidence: confidence ?? 1 })
    .eq("id", normalized_id);
  if (nm.account_id && nm.provider && nm.provider_message_id) {
    await supabase
      .from("inbox_messages")
      .update({ ai_label, ai_confidence: confidence ?? 1 })
      .eq("account_id", nm.account_id)
      .eq("provider", nm.provider)
      .eq("provider_message_id", nm.provider_message_id)
      .catch(() => {});
  }


  if (u1) {
    return NextResponse.json({ error: u1.message }, { status: 500 });
  }

  if (nm.linked_thread_id) {
    const mark =
      ai_label === "human_reply" ||
      ai_label === "question" ||
      ai_label === "positive" ||
      ai_label === "neutral";
    await supabase
      .rpc("mark_thread_reply", {
        p_thread: nm.linked_thread_id,
        p_when: nm.sent_at ?? null,
        p_needs_reply: mark,
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}


