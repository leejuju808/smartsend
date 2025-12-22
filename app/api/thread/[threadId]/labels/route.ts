import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("message_labels")
    .select("created_at, message_id, label_key, confidence, source")
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data ?? []);
}



