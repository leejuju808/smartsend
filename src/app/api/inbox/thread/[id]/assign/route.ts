import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { user_id } = await req.json(); // null to unassign

  // Check if params.id is a UUID or thread_key
  // First, try to find the thread by id or thread_key and get its id
  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id")
    .or(`id.eq.${params.id},thread_key.eq.${params.id}`)
    .maybeSingle();

  if (!thread || !thread.id) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { error } = await supabase.rpc("set_thread_assignee", {
    p_thread: thread.id,
    p_user: user_id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  
  return NextResponse.json({ ok: true });
}
