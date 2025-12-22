import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  // Thread + lead + campaign vars
  const { data: row, error } = await supabase
    .from("v_vars_thread")
    .select("*")
    .eq("thread_id", params.threadId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sender vars (current user)
  const me = await supabase.auth.getUser();
  let sender = { sender_name: null as string | null, sender_email: null as string | null };
  if (me.data.user) {
    const { data: u } = await supabase
      .from("v_vars_user")
      .select("*")
      .eq("user_id", me.data.user.id)
      .maybeSingle();
    sender = {
      sender_name: u?.sender_name ?? null,
      sender_email: u?.sender_email ?? null,
    };
  }

  return NextResponse.json({ vars: { ...(row ?? {}), ...sender } });
}

