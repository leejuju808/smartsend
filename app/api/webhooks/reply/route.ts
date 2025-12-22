import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-reply-secret") ?? "";
  if (secret !== process.env.REPLY_WEBHOOK_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply_detection`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-reply-secret": process.env.REPLY_WEBHOOK_SECRET as string },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return NextResponse.json(json, { status: res.status });
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (!secret || secret !== process.env.REPLY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/reply-detection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.REPLY_WEBHOOK_SECRET!,
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (!secret || secret !== process.env.REPLY_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const payload = await req.json();

    // forward to supabase edge function (internal call)
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/reply-detection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.REPLY_WEBHOOK_SECRET!,
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


