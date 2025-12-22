import { NextResponse } from "next/server";
import { gmail, getOAuthClient } from "@/lib/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST { workspaceId: string }
export async function POST(req: Request) {
  try {
    const { workspaceId } = await req.json();
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const { oauth2Client, integration } = await getOAuthClient(workspaceId);
    const g = gmail(oauth2Client);

    const topicName = process.env.GMAIL_PUBSUB_TOPIC!; // e.g. projects/your-proj/topics/smartsend-gmail
    const labelIds = ["INBOX"]; // only inbox changes (tweak as needed)

    const watch = await g.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds,
        labelFilterAction: "include",
      },
    });

    const expiration = watch.data.expiration
      ? new Date(Number(watch.data.expiration)).toISOString()
      : null;

    await supabaseAdmin
      .from("integrations_gmail")
      .update({
        last_history_id: watch.data.historyId ?? integration.last_history_id,
        watch_expiration: expiration,
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return NextResponse.json({
      ok: true,
      historyId: watch.data.historyId,
      expiration,
    });
  } catch (e: any) {
    console.error("gmail/watch error", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}