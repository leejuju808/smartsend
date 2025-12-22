import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { threadId } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // needs write across RLS, or implement RLS for the user session
  );

  const { error } = await supabase
    .from("email_messages")
    .update({ is_read: true })
    .eq("thread_id", threadId)
    .eq("direction", "in");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

