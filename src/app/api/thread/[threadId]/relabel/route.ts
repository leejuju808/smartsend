import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: m, error } = await supabase
    .from("normalized_messages")
    .select("id, subject, html, preview_clean")
    .eq("linked_thread_id", params.threadId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !m) {
    return NextResponse.json({ error: "No inbound to relabel" }, { status: 404 });
  }

  const body = (m.html || m.preview_clean || "").toString();

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-label`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-cron-secret": process.env.CRON_SECRET!,
    },
    body: JSON.stringify({ subject: m.subject ?? "", body }),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: j?.error ?? "classify failed" }, { status: 500 });
  }

  await supabase
    .from("normalized_messages")
    .update({ ai_label: j.label, ai_confidence: j.confidence ?? null, ai_model: j.model ?? null })
    .eq("id", m.id);

  return NextResponse.json({ ok: true, label: j.label, confidence: j.confidence ?? null });
}


