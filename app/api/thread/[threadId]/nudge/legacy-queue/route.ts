import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const threadId = params.threadId;

  if (!threadId) {
    return NextResponse.json({ error: "invalid_thread" }, { status: 400 });
  }

  const { data: allowed } = await supabase
    .rpc("nudge_allowed", { p_thread: threadId })
    .single()
    .catch(() => ({ data: null }));

  if (!allowed?.ok) {
    const reason = allowed?.reason ?? "not_allowed";
    return NextResponse.json({ ok: false, error: reason }, { status: 429 });
  }

  const origin = req.nextUrl.origin;
  const renderResponse = await fetch(new URL(`/api/thread/${threadId}/nudge/render`, origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: req.headers.get("cookie") ?? "",
    },
  });

  if (!renderResponse.ok) {
    let errorDetail: unknown;
    try {
      const text = await renderResponse.text();
      errorDetail = text ? JSON.parse(text) : { status: renderResponse.status };
    } catch {
      errorDetail = { status: renderResponse.status };
    }
    return NextResponse.json({ error: "render_failed", detail: errorDetail }, { status: 500 });
  }

  const rendered = await renderResponse.json().catch(() => null);
  if (!rendered || !rendered.ok) {
    return NextResponse.json({ error: "render_failed" }, { status: 500 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,lead_id,subject")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });
  if (!thread) {
    return NextResponse.json({ error: "context_not_found" }, { status: 404 });
  }

  const { data: lead, error: leadError } = await supabase.from("leads").select("email").eq("id", thread.lead_id).maybeSingle();
  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });

  const { error } = await supabase.from("send_queue").insert({
    campaign_id: thread.campaign_id,
    lead_id: thread.lead_id,
    thread_id: thread.id,
    subject: thread.subject ? `Re: ${thread.subject}` : rendered.subject,
    body: rendered.body,
    headers: { to: lead?.email ?? null },
    status: "draft",
    source: "followup_nudge",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

