import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const threadId = params.id;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();

  let accountId = profile?.account_id ?? null;

  if (!accountId) {
    const { data: thread } = await supabase
      .from("threads")
      .select("campaign_id")
      .eq("id", threadId)
      .maybeSingle();

    if (thread?.campaign_id) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("account_id")
        .eq("id", thread.campaign_id)
        .maybeSingle();

      accountId = campaign?.account_id ?? null;
    }
  }

  if (!accountId) {
    return NextResponse.json({ ok: false, error: "No account" }, { status: 400 });
  }

  const { error } = await supabase.rpc("unpause_thread", {
    p_thread_id: threadId,
    p_account_id: accountId,
    p_actor_id: user.id,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}


