import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { devOnly, getTestStore } from "../_store";

type InboundPayload = {
  thread_id?: string;
  text?: string;
};

export async function POST(req: NextRequest) {
  try {
    devOnly();
  } catch {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const body = (await req.json()) as InboundPayload;
  const threadId = body.thread_id;

  if (!threadId) {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("inbox_messages").insert({
    thread_id: threadId,
    direction: "inbound",
    body_html: body.text ?? "Test inbound message",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const store = getTestStore();
  store.queue.set(threadId, 0);

  return NextResponse.json({ ok: true });
}







