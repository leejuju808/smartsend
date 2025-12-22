import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RouteContext = {
  params: {
    id: string;
  };
};

type RequestBody = {
  subject?: string;
  content?: string;
  send?: boolean;
};

export async function POST(req: Request, { params }: RouteContext) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase env not configured" }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const incoming = (await req.json().catch(() => ({}))) as RequestBody;
  const subject = typeof incoming.subject === "string" ? incoming.subject : "";
  const content = typeof incoming.content === "string" ? incoming.content : "";
  const shouldSend = Boolean(incoming.send);

  const { data: latest, error: latestError } = await sb
    .from("reply_rewrites")
    .select("id")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return NextResponse.json({ error: latestError.message }, { status: 400 });
  }

  if (latest) {
    const { error: updateError } = await sb.from("reply_rewrites").update({ approved: true }).eq("id", latest.id);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  if (shouldSend) {
    const payload = { subject, body: content };
    const { error: rpcError } = await sb.rpc("fn_send_email_guarded", {
      p_thread_id: params.id,
      p_payload: payload,
    });

    if (rpcError) {
      const { error: insertError } = await sb.from("send_queue").insert({
        thread_id: params.id,
        subject,
        body: content,
        status: "draft",
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}


