// app/api/hotleads/today/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const ownerId = user.id;
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  // Fetch hot lead events for today
  const { data: events, error } = await supabase
    .from("hot_lead_events")
    .select(
      `
      id,
      lead_id,
      created_at,
      was_seen,
      inbound_email_id,
      inbound_message_id,
      leads (
        id,
        name,
        email,
        city
      )
    `
    )
    .eq("owner_id", ownerId)
    .gte("created_at", todayStart)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Hot leads load error:", error);
    return NextResponse.json(
      { error: "Failed to load hot leads" },
      { status: 500 }
    );
  }

  // Get snippets from inbound_emails or inbound_messages
  const items = await Promise.all(
    (events ?? []).map(async (e) => {
      let snippet: string | null = null;

      // Try to get snippet from inbound_emails first
      if (e.inbound_email_id) {
        const { data: inboundEmail } = await supabase
          .from("inbound_emails")
          .select("snippet, body_text, subject")
          .eq("id", e.inbound_email_id)
          .maybeSingle();

        if (inboundEmail) {
          snippet =
            inboundEmail.snippet ||
            inboundEmail.body_text?.substring(0, 120) ||
            inboundEmail.subject ||
            null;
        }
      }

      // Fallback to inbound_messages if no snippet from inbound_emails
      if (!snippet && e.inbound_message_id) {
        const { data: inboundMessage } = await supabase
          .from("inbound_messages")
          .select("snippet, text_body, subject")
          .eq("id", e.inbound_message_id)
          .maybeSingle();

        if (inboundMessage) {
          snippet =
            inboundMessage.snippet ||
            inboundMessage.text_body?.substring(0, 120) ||
            inboundMessage.subject ||
            null;
        }
      }

      return {
        id: e.id,
        lead_id: e.lead_id,
        created_at: e.created_at,
        was_seen: e.was_seen,
        lead: e.leads,
        snippet,
      };
    })
  );

  const count_unseen = items.filter((e) => !e.was_seen).length;

  return NextResponse.json(
    {
      count_unseen,
      items,
    },
    { status: 200 }
  );
}

























































