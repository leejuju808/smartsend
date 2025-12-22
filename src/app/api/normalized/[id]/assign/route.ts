import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  campaign_id: z.string().uuid(),
  lead_id: z.string().uuid(),
  thread_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { campaign_id, lead_id, thread_id } = parsed.data;

  let tId = thread_id;
  if (!tId) {
    const { data, error } = await supabase.rpc("upsert_inbox_thread", {
      p_campaign: campaign_id,
      p_lead: lead_id,
      p_provider: null,
      p_provider_thread_id: null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    tId = (Array.isArray(data) ? data[0] : (data as any)) ?? undefined;
  }

  if (!tId) {
    return NextResponse.json({ error: "Thread resolution failed" }, { status: 500 });
  }

  const { error: uerr } = await supabase
    .from("normalized_messages")
    .update({ linked_thread_id: tId, link_status: "linked", link_error: null })
    .eq("id", params.id);

  if (uerr) {
    return NextResponse.json({ error: uerr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, thread_id: tId });
}


