import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_req: NextRequest, { params }: { params: { recipient: string }}) {
  const recipient = decodeURIComponent(params.recipient);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ items: mockRecipient(recipient) });
  }

  const sb = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await sb.from("email_events")
    .select("id, event_type, created_at, subject, campaigns(name)")
    .eq("recipient", recipient)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ items: mockRecipient(recipient) });

  const items = (data ?? []).map((r:any)=> ({
    id: r.id,
    event_type: r.event_type,
    created_at: r.created_at,
    subject: r.subject ?? null,
    campaign_name: r.campaigns?.name ?? null,
  }));

  return NextResponse.json({ items });
}

function mockRecipient(recipient: string) {
  const now = Date.now();
  return [
    { id: 1, event_type: "sent", created_at: new Date(now-1000*60*60*24).toISOString(), subject: "Intro & quick question", campaign_name: "Warmup A" },
    { id: 2, event_type: "opened", created_at: new Date(now-1000*60*60*23).toISOString(), subject: "Intro & quick question", campaign_name: "Warmup A" },
    { id: 3, event_type: "clicked", created_at: new Date(now-1000*60*60*22).toISOString(), subject: "Intro & quick question", campaign_name: "Warmup A" },
  ];
}