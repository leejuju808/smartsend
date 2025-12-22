// app/api/inbox/[id]/intent/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();
  const { intent_label } = body as {
    intent_label:
      | "hot_lead"
      | "warm_lead"
      | "follow_up"
      | "not_interested"
      | "unsubscribe"
      | "unknown";
  };

  const messageId = params.id;

  const { data: msg, error } = await supabase
    .from("email_messages")
    .select("id, workspace_id, contact_id")
    .eq("id", messageId)
    .single();

  if (error || !msg) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Update email intent
  const { error: updateError } = await supabase
    .from("email_messages")
    .update({ intent_label })
    .eq("id", messageId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }

  // Optionally: also update contact lead_status & pipeline stage with existing helper
  // e.g. call handleIntentSideEffects(workspaceId, contactId, intent_label)

  return NextResponse.json({ ok: true });
}



























































