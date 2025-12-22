import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaign_id");
  const emailId = searchParams.get("email_id");
  const cursor = searchParams.get("cursor");
  const pageSize = 30;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const mock = mockEvents({ campaignId, emailId, cursor, pageSize });
    return NextResponse.json(mock);
  }

  const sb = createClient(supabaseUrl, supabaseKey);

  let query = sb.from("email_events")
    .select("id, email_id, campaign_id, event_type, created_at, recipient, subject, campaigns(name)")
    .order("created_at", { ascending: false })
    .limit(pageSize + 1);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (emailId) query = query.eq("email_id", emailId);
  if (cursor) query = query.lt("created_at", cursor);

  const { data, error } = await query;
  if (error) {
    const mock = mockEvents({ campaignId, emailId, cursor, pageSize });
    return NextResponse.json(mock);
  }

  const items = (data ?? []).slice(0, pageSize).map((r:any)=> ({
    id: r.id,
    email_id: r.email_id,
    campaign_id: r.campaign_id,
    campaign_name: r.campaigns?.name ?? null,
    event_type: r.event_type,
    created_at: r.created_at,
    recipient: r.recipient ?? null,
    subject: r.subject ?? null,
  }));

  const next_cursor = (data ?? []).length > pageSize ? data![pageSize].created_at : null;
  const title = campaignId ? `Events — ${items[0]?.campaign_name ?? "Campaign"}` : emailId ? `Events for email ${emailId}` : "Event log";

  return NextResponse.json({ items, next_cursor, title });
}

function mockEvents({ campaignId, emailId, cursor, pageSize }: { campaignId: string | null; emailId: string | null; cursor: string | null; pageSize: number; }) {
  const startIdx = 0;
  const now = new Date();
  const items = Array.from({ length: pageSize }).map((_, i) => {
    const ts = new Date(now.getTime() - (i + (cursor ? 30 : 0)) * 60 * 1000).toISOString();
    const types = ["sent", "opened", "clicked", "bounced"] as const;
    const t = types[Math.floor(Math.random() * types.length)];
    return {
      id: i + 1,
      email_id: emailId ?? `e_${Math.floor(Math.random() * 9999)}`,
      campaign_id: campaignId ?? `cmp_${Math.floor(Math.random() * 999)}`,
      campaign_name: "Mock Campaign",
      event_type: t,
      created_at: ts,
      recipient: `ceo${i}@acme.com`,
      subject: `Mock subject #${i}`,
    };
  });
  return { items, next_cursor: null, title: campaignId ? `Events — Mock Campaign` : emailId ? `Events for email ${emailId}` : "Event log" };
}