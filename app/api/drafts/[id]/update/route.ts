import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { assertEditor } from "@/lib/acl";

const Body = z.object({
  campaign_id: z.string().uuid(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).optional(),
  to: z.string().email().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const payload = Body.safeParse(await req.json().catch(() => ({})));

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  try {
    await assertEditor(payload.data.campaign_id);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const current = await supabase
    .from("send_queue")
    .select("campaign_id,status,headers")
    .eq("id", params.id)
    .maybeSingle();

  if (current.error) {
    return NextResponse.json({ error: current.error.message }, { status: 500 });
  }

  if (
    !current.data ||
    current.data.campaign_id !== payload.data.campaign_id ||
    current.data.status !== "draft"
  ) {
    return NextResponse.json({ error: "not a draft or wrong campaign" }, { status: 400 });
  }

  const nextHeaders = {
    ...(current.data.headers ?? {}),
    ...(payload.data.to ? { to: payload.data.to } : {}),
  };

  const { error } = await supabase
    .from("send_queue")
    .update({
      subject: payload.data.subject,
      body: payload.data.body,
      headers: nextHeaders,
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



