import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const Body = z.object({
  id: z.string().uuid().optional(),
  campaign_id: z.string().uuid(),
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  tags: z.array(z.string().min(1).max(64)).optional(),
  is_active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const authClient = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const input = parsed.data;
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const { data: hasAccess, error: aclError } = await authClient.rpc("is_campaign_member", {
    p_campaign: input.campaign_id,
    p_user: user.id,
    p_roles: ["owner", "editor"],
  });

  if (aclError) {
    return NextResponse.json({ error: aclError.message }, { status: 500 });
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const tags = input.tags?.map((t) => t.trim()).filter(Boolean);
  const payload: Record<string, unknown> = {
    campaign_id: input.campaign_id,
    key: input.key.trim().toLowerCase(),
    title: input.title.trim(),
    body: input.body,
    tags: tags?.length ? tags : [],
  };

  if (input.id) {
    payload.id = input.id;
  }

  if (input.is_active !== undefined) {
    payload.is_active = input.is_active;
  }

  const { data, error } = await supabase
    .from("reply_macros")
    .upsert(payload, { onConflict: "campaign_id,key" })
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, macro: data });
}


