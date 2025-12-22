// app/api/replies/[replyId]/quick-reply/route.ts

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

  const { subject, body } = await req.json().catch(() => ({}));

  if (!body || typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "Body is required" },
      { status: 400 }
    );
  }

  // 1. Load reply, campaign_id, lead_id
  const { data: reply, error: replyError } = await supabase
    .from("campaign_replies")
    .select("id, campaign_id, lead_id")
    .eq("id", params.replyId)
    .single();

  if (replyError || !reply) {
    return NextResponse.json({ error: "Reply not found" }, { status: 404 });
  }

  // 2. Check membership for that campaign
  const { data: member, error: memberError } = await supabase
    .from("campaign_members")
    .select("id, role")
    .eq("campaign_id", reply.campaign_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json(
      { error: "You do not have access to this campaign" },
      { status: 403 }
    );
  }

  // Optional: only owner/editor can send
  // if (member.role === "viewer") {
  //   return NextResponse.json(
  //     { error: "Viewers cannot send replies" },
  //     { status: 403 }
  //   );
  // }

  // 3. Insert campaign_sends row (queue for your orchestrator)
  const { data: sendRow, error: sendError } = await supabase
    .from("campaign_sends")
    .insert({
      campaign_id: reply.campaign_id,
      lead_id: reply.lead_id,
      subject: subject || null, // optional; thread might not need subject
      body,
      kind: "manual_reply",
      is_manual: true,
      in_reply_to_reply_id: reply.id,
      scheduled_at: new Date().toISOString(), // schedule immediately
      status: "pending",
      // leave sent_at NULL so your send queue picks it up
    })
    .select("id")
    .single();

  if (sendError || !sendRow) {
    console.error("Quick reply: failed to insert campaign_sends", sendError);
    return NextResponse.json(
      { error: "Failed to queue reply" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: "ok",
    send_id: sendRow.id,
  });
}

