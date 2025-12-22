import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const user = req.nextUrl.searchParams.get("user")!;
  const thread = req.nextUrl.searchParams.get("thread")!;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await supabase
    .from("reply_messages")
    .select("*")
    .eq("user_id", user)
    .eq("gmail_thread_id", thread)
    .order("internal_ts", { ascending: true });
  if (error) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: data ?? [] });
}












