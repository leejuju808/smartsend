import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { devOnly, getTestStore } from "../_store";

export async function GET(req: NextRequest) {
  try {
    devOnly();
  } catch {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("thread_id");

  if (!threadId) {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  const store = getTestStore();
  const pending = store.queue.get(threadId) ?? 0;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("inbox_threads")
    .select("reply_type")
    .eq("id", threadId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    pending_count: pending,
    reply_type: data?.reply_type ?? null,
  });
}







