import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type ActionRequest = {
  needs_reply?: boolean;
  message_id?: string;
  ai_label?: string;
};

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const payload = ((await req.json().catch(() => ({}))) ?? {}) as ActionRequest;

  if (typeof payload.needs_reply === "boolean") {
    const { error } = await supabase
      .from("inbox_threads")
      .update({ needs_reply: payload.needs_reply })
      .eq("id", params.threadId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (payload.message_id && typeof payload.ai_label === "string") {
    const { error } = await supabase
      .from("normalized_messages")
      .update({ ai_label: payload.ai_label })
      .eq("id", payload.message_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}



