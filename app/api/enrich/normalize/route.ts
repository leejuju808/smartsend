import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function setAccountContext(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
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
    await supabase.rpc("set_account", { p_account_id: membership.account_id });
  }

  return { error: null };
}

export async function POST() {
  const supabase = createClient();
  const { error } = await setAccountContext(supabase);
  if (error) {
    return error;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error: rpcError } = await supabase.rpc("normalize_enrichment_since", {
    p_since: since,
    p_limit: 2000,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json({ normalized: data ?? 0 });
}



