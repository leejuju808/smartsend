import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { assertEditor } from "@/lib/acl";

const Body = z.object({ campaign_id: z.string().uuid() });

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { campaign_id } = parsed.data;

  try {
    await assertEditor(campaign_id);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("send_queue")
    .update({
      status: "dead",
      next_attempt_at: null,
      picked_at: null,
      last_status: "permanent",
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}



