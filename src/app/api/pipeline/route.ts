import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: () => undefined,
        set: () => {},
        remove: () => {}
      }
    }
  );

  // Join email_replies with reply_intents to get classification data
  const { data, error } = await supabase
    .from("email_replies")
    .select(`
      id,
      from_email,
      subject,
      body,
      received_at,
      reply_intents!inner(
        category,
        confidence
      )
    `)
    .order("received_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Map reply_intents categories to pipeline statuses
  const categoryMapping: Record<string, string> = {
    'interested': 'Interested',
    'meeting': 'Follow Up',
    'not_interested': 'Not Interested',
    'question': 'Unclear',
    'other': 'Uncategorized'
  };

  const grouped = (data || []).reduce((acc: any, r: any) => {
    const category = r.reply_intents?.category || 'other';
    const status = categoryMapping[category] || 'Uncategorized';
    
    if (!acc[status]) acc[status] = [];
    
    acc[status].push({
      reply_id: r.id,
      from_email: r.from_email,
      subject: r.subject,
      received_at: r.received_at,
      sentiment: r.reply_intents?.category || 'other',
      classification: status
    });
    
    return acc;
  }, {});

  return NextResponse.json({ pipeline: grouped });
}