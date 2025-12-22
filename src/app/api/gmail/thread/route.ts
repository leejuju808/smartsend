import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { user_id, threadId } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.functions.invoke("fetch_gmail_thread", {
    body: { user_id, threadId }
  });
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json(data);
}












