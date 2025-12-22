import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request, { params }: { params: { thread_id: string } }) {
  const supabase = createClient();

  const { text } = await req.json();

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Message text is required" }, { status: 400 });
  }

  // Store outgoing message
  const { data, error } = await supabase
    .from("messages")
    .insert({
      thread_id: params.thread_id,
      body_text: text,
      direction: "outgoing",
    })
    .select()
    .single();

  if (error) {
    console.error("Error inserting message:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // TODO: integrate Gmail/Outlook sending queue
  // push into "send_queue"

  return NextResponse.json({ message: data });
}










