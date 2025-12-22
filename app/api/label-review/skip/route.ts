import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { queue_id } = await req.json().catch(() => ({}));
  if (!queue_id) {
    return NextResponse.json({ error: "missing queue_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("label_review_queue")
    .update({ status: "skipped" })
    .eq("id", queue_id)
    .eq("owner_id", user.id);

  if (error) {
    console.error("label-review/skip failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
















