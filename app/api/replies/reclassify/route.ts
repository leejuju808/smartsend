import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";

const ALLOWED = ["positive", "neutral", "question", "negative", "unsubscribe", "out_of_office", "unknown"] as const;

type AllowedIntent = (typeof ALLOWED)[number];

export async function POST(req: Request) {
  try {
    const { thread_id, human_intent, note }: { thread_id?: string; human_intent?: AllowedIntent; note?: string | null } =
      await req.json();

    if (!thread_id || !human_intent || !ALLOWED.includes(human_intent)) {
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }

    const supabaseUser = await createServerClient();
    const { data: me, error: userError } = await supabaseUser.auth.getUser();
    if (userError) {
      console.error("Failed to fetch user for reclassify", userError);
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { error: insertError } = await supabase.from("reply_human_labels").insert({
      thread_id,
      human_intent,
      created_by: me.user?.id ?? null,
      note: note ?? null,
    });
    if (insertError) {
      console.error("Failed to insert reply_human_labels", insertError);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("inbox_threads")
      .update({
        ai_intent: human_intent,
        ai_classified_at: new Date().toISOString(),
      })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Failed to update inbox_threads", updateError);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reclassify handler error", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

