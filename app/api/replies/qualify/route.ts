// app/api/replies/qualify/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // Get user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { replyId, status } = body;

  if (!replyId) {
    return NextResponse.json(
      { ok: false, error: "replyId is required" },
      { status: 400 }
    );
  }

  // Validate status
  if (status && !["hot", "warm", "cold", "not_interested"].includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Invalid status. Must be one of: hot, warm, cold, not_interested" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("email_replies")
    .update({ qualified: status || null })
    .eq("id", replyId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}












