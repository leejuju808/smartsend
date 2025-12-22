import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(_: NextRequest, { params }: { params: { draftId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: draft, error: fetchError } = await supabase
    .from("reply_drafts")
    .select("id, campaign_id, status")
    .eq("id", params.draftId)
    .maybeSingle();
  if (fetchError || !draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if (draft.status !== "draft") {
    return NextResponse.json({ error: "Already processed" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("enqueue_reply_draft", { p_draft: params.draftId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: !!data });
}


