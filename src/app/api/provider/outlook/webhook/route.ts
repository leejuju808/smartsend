import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Normalize payload coming from your Outlook webhook
  // Expecting: { lead_id, from_email, to_email, subject, body, received_at }

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-detector`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      provider: 'outlook',
      ...body
    })
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: 400 });
  }
  const data = await res.json();
  return NextResponse.json(data, { status: 200 });
}

