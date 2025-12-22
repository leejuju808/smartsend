import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

import { assertEditor, assertViewer } from "@/lib/acl";

const Upsert = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  subject: z.string().max(200).optional(),
  body: z.string().min(1),
  is_shared: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    await assertViewer(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("email_templates")
    .select("id,created_at,updated_at,name,subject,body,is_shared")
    .eq("campaign_id", params.campaignId)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Upsert.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const me = await supabase.auth.getUser();
  const row = {
    id: parsed.data.id,
    user_id: me.data.user?.id ?? null,
    campaign_id: params.campaignId,
    name: parsed.data.name,
    subject: parsed.data.subject ?? null,
    body: parsed.data.body,
    is_shared: parsed.data.is_shared ?? false,
  };

  const { data, error } = await supabase
    .from("email_templates")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}




