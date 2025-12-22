import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { threadId, leadId, subject, bodyText } = await req.json();

  // This API inserts an outbound message immediately for optimistic UI.
  // Your background sender (Edge Function / Cron) can pick it up and deliver via Gmail/Outlook.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("email_messages")
    .insert({
      thread_id: threadId,
      lead_id: leadId,
      direction: "out",
      subject: subject ?? null,
      body_text: bodyText,
      sent_at: new Date().toISOString(),
      is_read: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // TODO: enqueue provider send (e.g., insert into outbox table or call Edge Function)
  return NextResponse.json({ id: data.id });
}

