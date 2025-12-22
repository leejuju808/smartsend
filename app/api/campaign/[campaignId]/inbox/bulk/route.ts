import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";
import { assertEditor } from "@/lib/acl";

const Body = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(["mark_done", "mark_needs_reply", "snooze", "unsnooze", "assign", "unassign"]),
  until: z.string().datetime().optional(),
  user_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  try {
    await assertEditor(params.campaignId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const payload = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ids, action, until, user_id } = parsed.data;

  if (action === "mark_done") {
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        needs_reply: false,
        replied_at: new Date().toISOString(),
      })
      .in("id", ids)
      .eq("campaign_id", params.campaignId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "mark_needs_reply") {
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        needs_reply: true,
        replied_at: null,
      })
      .in("id", ids)
      .eq("campaign_id", params.campaignId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "snooze") {
    const iso = until ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        snoozed_until: iso,
      })
      .in("id", ids)
      .eq("campaign_id", params.campaignId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "unsnooze") {
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        snoozed_until: null,
      })
      .in("id", ids)
      .eq("campaign_id", params.campaignId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "assign") {
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        assigned_to: user_id ?? null,
      })
      .in("id", ids)
      .eq("campaign_id", params.campaignId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (action === "unassign") {
    const { error } = await supabase
      .from("inbox_threads")
      .update({
        assigned_to: null,
      })
      .in("id", ids)
      .eq("campaign_id", params.campaignId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

