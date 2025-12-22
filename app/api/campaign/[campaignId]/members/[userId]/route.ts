import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { dispatchCampaignWebhooks } from "@/lib/webhooks";
import { assertOwner } from "@/lib/acl";

const Body = z.object({
  role: z.enum(["owner", "editor", "viewer"]),
});

export async function POST(req: NextRequest, { params }: { params: { campaignId: string; userId: string } }) {
  try {
    await assertOwner(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const parsed = Body.safeParse(
    await req.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("campaign_members")
    .update({ role: parsed.data.role })
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: logError } = await supabase.rpc("log_campaign_event", {
    p_campaign: params.campaignId,
    p_type: "member_role_changed",
    p_target_user: params.userId,
    p_invite: null,
    p_meta: { role: parsed.data.role },
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  await dispatchCampaignWebhooks(params.campaignId);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: { campaignId: string; userId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id !== params.userId) {
    try {
      await assertOwner(params.campaignId);
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("campaign_members")
    .delete()
    .eq("campaign_id", params.campaignId)
    .eq("user_id", params.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: logError } = await supabase.rpc("log_campaign_event", {
    p_campaign: params.campaignId,
    p_type: "member_removed",
    p_target_user: params.userId,
    p_invite: null,
    p_meta: {},
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  await dispatchCampaignWebhooks(params.campaignId);

  return NextResponse.json({ ok: true });
}


