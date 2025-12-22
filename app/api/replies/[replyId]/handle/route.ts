// app/api/replies/[replyId]/handle/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(
  req: Request,
  { params }: { params: { replyId: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const handled = body.handled === true;

  // 1. Load reply + campaign_id
  const { data: reply, error: replyError } = await supabase
    .from("campaign_replies")
    .select("id, campaign_id")
    .eq("id", params.replyId)
    .single();

  if (replyError || !reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  // 2. Ensure user is member of that campaign
  const { data: member, error: memberError } = await supabase
    .from("campaign_members")
    .select("id")
    .eq("campaign_id", reply.campaign_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json(
      { error: "You do not have access to this campaign" },
      { status: 403 }
    );
  }

  // 3. Update handled state
  const payload = handled
    ? {
        handled_at: new Date().toISOString(),
        handled_by_user_id: user.id,
      }
    : {
        handled_at: null,
        handled_by_user_id: null,
      };

  const { error: updateError } = await supabase
    .from("campaign_replies")
    .update(payload)
    .eq("id", reply.id);

  if (updateError) {
    console.error("Failed to update reply handled state:", updateError);
    return NextResponse.json(
      { error: "Failed to update reply" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "ok", handled });
}































































