import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { devOnly, getTestStore } from "../_store";

export async function POST() {
  try {
    devOnly();
  } catch {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const threadId = randomUUID();
  const { error } = await supabase.from("inbox_threads").insert({
    id: threadId,
    subject: "Test thread",
    needs_reply: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const store = getTestStore();
  store.queue.set(threadId, 0);

  return NextResponse.json({ thread_id: threadId });
}

