import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { assertEditor } from "@/lib/acl";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const payload = Body.safeParse(await req.json().catch(() => ({})));

  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("send_queue")
    .delete()
    .in("id", payload.data.ids)
    .eq("campaign_id", params.campaignId)
    .eq("status", "draft");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}



