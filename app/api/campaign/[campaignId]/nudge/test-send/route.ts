import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const rawBody = typeof body.body === "string" ? body.body : "";

  if (!to) {
    return NextResponse.json({ ok: false, error: "missing_to" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("nudge_test_send", {
    p_campaign_id: params.campaignId,
    p_to_email: to,
    p_subject: subject,
    p_body: rawBody,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "enqueue_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data ?? {}) });
}


