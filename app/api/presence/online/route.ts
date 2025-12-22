import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const windowStart = new Date(Date.now() - 90_000).toISOString();
  const { data, error } = await supabase
    .from("user_presence")
    .select("user_id,last_seen_at")
    .gt("last_seen_at", windowStart);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ online: data ?? [] });
}



