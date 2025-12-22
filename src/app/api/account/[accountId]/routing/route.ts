import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { z } from "zod";

const Rule = z.object({
  to_email: z.string().email().optional(),
  to_domain: z.string().optional(),
  plus_tag: z.string().optional(),
  campaign_id: z.string().uuid(),
  priority: z.number().min(1).max(999).default(100),
  enabled: z.boolean().default(true),
});
const Body = z.object({ rules: z.array(Rule) });

export async function GET(_: NextRequest, { params }: { params: { accountId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("inbound_routing_rules")
    .select("*")
    .eq("account_id", params.accountId)
    .order("priority", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: account, error: accountError } = await supabase
    .from("connected_accounts")
    .select("default_campaign_id")
    .eq("id", params.accountId)
    .maybeSingle();
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });

  return NextResponse.json({
    rules: data ?? [],
    default_campaign_id: account?.default_campaign_id ?? null,
  });
}

export async function POST(req: NextRequest, { params }: { params: { accountId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data.rules.map((r) => ({ ...r, account_id: params.accountId }));
  const { error: delErr } = await supabase.from("inbound_routing_rules").delete().eq("account_id", params.accountId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { data, error } = await supabase.from("inbound_routing_rules").insert(payload).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rules: data });
}

