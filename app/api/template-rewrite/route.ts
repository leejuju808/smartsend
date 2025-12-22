import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/template-rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Rewrite failed');
    return NextResponse.json(data);
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/template-rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Rewrite failed');
    return NextResponse.json(data);
  } catch (e:any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


