import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: t, error } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (error || !t) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  const fn = `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ?? ""}/meeting-recompute`;
  const r = await fetch(fn, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({ thread_id: params.threadId }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    return NextResponse.json({ error: j.error || "recompute_failed" }, { status: 500 });
  }

  return NextResponse.json(j);
}


