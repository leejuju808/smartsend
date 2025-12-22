import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const uid = data.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("user_presence")
    .upsert(
      { user_id: uid, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



