import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { thread_id }: { thread_id?: string } = await req.json();

  if (!thread_id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: me, error: userError } = await supabase.auth.getUser();
  if (userError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await supabase.rpc("resolve_review", {
    p_thread_id: thread_id,
    p_user: me.user?.id ?? null,
  });

  return NextResponse.json({ ok: true });
}

