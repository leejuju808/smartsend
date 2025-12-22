import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  const sb = createClient();
  const { threadId } = await req.json();
  
  await sb.rpc("thread_mark_read", { p_thread_id: threadId });
  
  return NextResponse.json({ ok: true });
}















