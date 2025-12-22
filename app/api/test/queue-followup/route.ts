import { NextRequest, NextResponse } from "next/server";
import { devOnly, getTestStore } from "../_store";

type QueuePayload = {
  thread_id?: string;
};

export async function POST(req: NextRequest) {
  try {
    devOnly();
  } catch {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const body = (await req.json()) as QueuePayload;
  const threadId = body.thread_id;

  if (!threadId) {
    return NextResponse.json({ error: "thread_id required" }, { status: 400 });
  }

  const store = getTestStore();
  const current = store.queue.get(threadId) ?? 0;
  store.queue.set(threadId, current + 1);

  return NextResponse.json({ ok: true });
}







