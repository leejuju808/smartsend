import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, "public", any>;

async function ensureAccountContext(supabase: AnyClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return null;
  }

  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.account_id) {
    await supabase.rpc("set_account", { p_account_id: membership.account_id }).catch(() => {});
    return membership.account_id;
  }

  return null;
}

export async function GET(_: Request, { params }: { params: { domain: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  await ensureAccountContext(supabase);

  const domain = params.domain.toLowerCase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("domain_suppressions")
    .select("reason, until")
    .eq("domain", domain)
    .gt("until", nowIso)
    .order("until", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("domain suppression lookup failed", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, suppression: null });
  }

  return NextResponse.json({ ok: true, suppression: data });
}

