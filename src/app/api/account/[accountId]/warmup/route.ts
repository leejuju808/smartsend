import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Body = z.object({
  enabled: z.boolean().optional(),
  daily_limit: z.number().int().min(1).max(500).optional(),
  ramp_days: z.number().int().min(1).max(60).optional(),
  auto_reply: z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { accountId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("warmup_settings")
    .select("*")
    .eq("account_id", params.accountId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function POST(req: NextRequest, { params }: { params: { accountId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update = parsed.data;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields provided" }, { status: 400 });
  }

  const row = { account_id: params.accountId, ...update };

  const { data, error } = await supabase
    .from("warmup_settings")
    .upsert(row, { onConflict: "account_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}



