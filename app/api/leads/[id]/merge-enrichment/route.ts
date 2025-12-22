import { NextRequest, NextResponse } from "next/server";
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

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { error } = await setAccountContext(supabase);
  if (error) {
    return error;
  }

  const { data, error: rpcError } = await supabase.rpc("merge_normalized_enrichment", {
    p_lead: params.id,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  return NextResponse.json(data ?? {});
}



