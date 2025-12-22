// app/api/email-events/[id]/override/route.ts
import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { kind, thread_id, campaign_id } = (await req.json()) as {
      kind: string;
      thread_id: string;
      campaign_id: string;
    };

    const supabase = createRouteHandlerClient({ cookies });

    const { data: role, error: roleError } = await supabase.rpc(
      "get_user_campaign_role",
      { p_campaign: campaign_id }
    );

    if (roleError || (role !== "owner" && role !== "editor")) {
      return NextResponse.json({ error: "not authorized" }, { status: 403 });
    }

    // Validate kind
    const validKinds = [
      "human",
      "ooo",
      "auto",
      "bounce",
      "unsubscribe",
      "spam",
      "unknown",
    ];
    if (!validKinds.includes(kind)) {
      return NextResponse.json(
        { error: "invalid kind" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("email_events")
      .update({
        ai_reply_kind: kind,
        ai_confidence: 1,
        classified_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    // Update thread status if human reply
    if (kind === "human" && thread_id) {
      await supabase
        .from("lead_threads")
        .update({ status: "replied", ai_last_reply_kind: "human" })
        .eq("id", thread_id)
        .in("status", ["open", "snoozed"]);
    } else if (thread_id) {
      // Update ai_last_reply_kind for other kinds
      await supabase
        .from("lead_threads")
        .update({ ai_last_reply_kind: kind })
        .eq("id", thread_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error overriding email event classification:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

