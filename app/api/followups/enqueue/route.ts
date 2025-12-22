import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("enqueue_followups", { p_limit: 200 });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ enqueued: data ?? 0 });
}




