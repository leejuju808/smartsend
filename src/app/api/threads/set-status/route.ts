import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { thread_id, status } = body || {};

    if (!thread_id || !status) {
      return NextResponse.json(
        { error: 'Missing thread_id or status' },
        { status: 400 }
      );
    }

    // Get auth token from request
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || 
                  req.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const edgeUrl = process.env.NEXT_PUBLIC_SUPABASE_EDGE_URL || supabaseUrl;

    if (!edgeUrl) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    // Forward to Edge Function with user's auth token
    const resp = await fetch(`${edgeUrl}/functions/v1/threads_set_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ thread_id, status }),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }

    return new NextResponse(JSON.stringify(data), {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in set-status route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

