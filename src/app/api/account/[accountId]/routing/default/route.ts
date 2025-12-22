import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({ campaign_id: z.string().uuid().nullable() });

export async function POST(req: NextRequest, { params }: { params: { accountId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("connected_accounts")
    .update({ default_campaign_id: parsed.data.campaign_id })
    .eq("id", params.accountId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}


