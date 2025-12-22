import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { id } = await params;

  // Fetch email events
  const { data: emailEvents, error: emailErr } = await supabase
    .from("email_events")
    .select(`
      id,
      event_type,
      direction,
      created_at,
      subject,
      body_text,
      reply_reason,
      provider_message_id,
      provider_thread_id
    `)
    .eq("lead_id", id)
    .order("created_at", { ascending: true });

  if (emailErr) {
    return NextResponse.json({ error: emailErr.message }, { status: 500 });
  }

  // Fetch lead_activity (non-email actions)
  const { data: activity, error: actErr } = await supabase
    .from("lead_activity")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });

  if (actErr) {
    return NextResponse.json({ error: actErr.message }, { status: 500 });
  }

  // Merge + sort chronologically
  const merged = [...(emailEvents ?? []), ...(activity ?? [])].sort(
    (a, b) => new Date(a.created_at).valueOf() - new Date(b.created_at).valueOf()
  );

  return NextResponse.json({ items: merged });
}

