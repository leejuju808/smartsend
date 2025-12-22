import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const { threadIds, labelName } = await req.json();
  if (!labelName || !Array.isArray(threadIds) || threadIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "labelName and threadIds required" },
      { status: 400 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("id", user.id)
    .maybeSingle();
  const accountId = profile?.account_id;
  if (!accountId)
    return NextResponse.json(
      { ok: false, error: "No account" },
      { status: 400 },
    );

  const { error } = await supabase.rpc("bulk_add_label", {
    p_account_id: accountId,
    p_label_name: labelName,
    p_thread_ids: threadIds,
  });
  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 400 },
    );

  return NextResponse.json({ ok: true });
}





