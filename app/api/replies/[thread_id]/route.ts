import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(_: Request, { params }: { params: { thread_id: string } }) {
  const supabase = createClient();

  // Try to get thread from reply_threads first
  const { data: replyThread } = await supabase
    .from("reply_threads")
    .select("id, lead_id, campaign_id")
    .eq("id", params.thread_id)
    .maybeSingle();

  // If not found, try threads table
  let thread = replyThread;
  if (!thread) {
    const { data: threadData } = await supabase
      .from("threads")
      .select("id, lead_id, campaign_id")
      .eq("id", params.thread_id)
      .maybeSingle();
    thread = threadData;
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", params.thread_id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ 
    messages: messages || [],
    thread: thread || null
  });
}

