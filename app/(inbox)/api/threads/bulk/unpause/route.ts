import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { threadIds } = await req.json();
  if (!Array.isArray(threadIds) || threadIds.length === 0)
    return NextResponse.json(
      { ok: false, error: "No threads" },
      { status: 400 },
    );

  const { error } = await supabase.rpc("unpause_threads", {
    p_thread_ids: threadIds,
  });
  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );

  return NextResponse.json({ ok: true });
}





