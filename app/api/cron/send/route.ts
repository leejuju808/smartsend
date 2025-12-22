import { NextResponse } from 'next/server';

export async function GET() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/send-runner`;
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  return NextResponse.json({ ok: res.ok, text });
}

import { NextResponse } from 'next/server';

export async function GET() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL}/send-runner`;
  const res = await fetch(url, { method: 'POST' });
  const text = await res.text();
  return NextResponse.json({ ok: res.ok, text });
}


