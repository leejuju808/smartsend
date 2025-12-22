import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const Body = z.object({
  campaign_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  source_message_id: z.string().uuid().optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const { data, error } = await sb
    .from("inbox_drafts")
    .select("*")
    .eq("thread_id", params.threadId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ draft: data ?? null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);

  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const p = parsed.data;

  const { data: thr, error: terr } = await sb
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();
  if (terr) return NextResponse.json({ error: terr.message }, { status: 500 });
  if (!thr || thr.campaign_id !== p.campaign_id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { error } = await sb.from("inbox_drafts").upsert(
    {
      thread_id: params.threadId,
      source_message_id: p.source_message_id ?? null,
      subject: p.subject ?? null,
      body: p.body,
    },
    { onConflict: "thread_id" },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}