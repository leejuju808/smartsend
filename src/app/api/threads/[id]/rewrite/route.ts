import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: RouteContext) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const [stateRes, rewriteRes] = await Promise.all([
    sb.from("v_inbox_state").select("*").eq("thread_id", params.id).maybeSingle(),
    sb
      .from("v_last_rewrite")
      .select("thread_id, reply_label, subject, body, created_at")
      .eq("thread_id", params.id)
      .maybeSingle(),
  ]);

  if (stateRes.error) {
    return NextResponse.json({ error: stateRes.error.message }, { status: 400 });
  }
  if (rewriteRes.error) {
    return NextResponse.json({ error: rewriteRes.error.message }, { status: 400 });
  }

  return NextResponse.json({
    threadId: params.id,
    label: stateRes.data?.label ?? null,
    rewrite: rewriteRes.data ?? null,
  });
}


