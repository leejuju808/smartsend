import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function PATCH(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const body = await req.json().catch(() => null);
  const needsReply = typeof body?.needs_reply === "boolean" ? body.needs_reply : undefined;

  if (typeof needsReply !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inbox_threads")
    .update({ needs_reply: needsReply })
    .eq("id", params.threadId);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

