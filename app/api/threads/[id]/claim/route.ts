import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, ensureCanAssign, getSessionUserId } from "../../_shared/assignment";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actorId = await getSessionUserId();
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();

    const { data: thread, error: threadErr } = await service
      .from("inbox_threads")
      .select("id,campaign_id,assigned_to")
      .eq("id", params.id)
      .single();

    if (threadErr || !thread) {
      return NextResponse.json({ error: threadErr?.message ?? "Not found" }, { status: 404 });
    }

    const allowed = await ensureCanAssign(thread.campaign_id, actorId);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (thread.assigned_to === actorId) {
      return NextResponse.json({ ok: true });
    }

    const { error: updateErr } = await service
      .from("inbox_threads")
      .update({ assigned_to: actorId })
      .eq("id", thread.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    await service.from("assign_events").insert({
      thread_id: thread.id,
      campaign_id: thread.campaign_id,
      actor: actorId,
      prev_user: thread.assigned_to,
      next_user: actorId,
      reason: "manual_claim",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


