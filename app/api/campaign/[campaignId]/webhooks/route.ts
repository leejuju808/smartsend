import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Upsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  url: z.string().url(),
  enabled: z.boolean().optional().default(true),
  event_types: z
    .array(
      z.enum([
        "invite_created",
        "invite_canceled",
        "invite_accepted",
        "member_role_changed",
        "member_removed",
      ]),
    )
    .min(1),
  secret: z.string().optional().nullable(),
});

export async function GET(_: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("campaign_webhooks")
    .select("id,created_at,name,url,enabled,event_types")
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ webhooks: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Upsert.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...rest } = parsed.data;
  const row: Record<string, unknown> = {
    ...rest,
    campaign_id: params.campaignId,
  };

  if (id) {
    row.id = id;
  }

  if (row.secret === undefined) {
    delete row.secret;
  }

  const { data, error } = await supabase
    .from("campaign_webhooks")
    .upsert(row as any, { onConflict: "id" })
    .select("id,created_at,name,url,enabled,event_types")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ webhook: data });
}





