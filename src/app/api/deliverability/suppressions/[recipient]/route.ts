import { NextRequest, NextResponse } from 'next/server';
import { removeSuppression } from '@/lib/suppressions';

export async function DELETE(_req: NextRequest, { params }: { params: { recipient: string }}) {
  const recipient = decodeURIComponent(params.recipient);
  await removeSuppression(recipient);
  return NextResponse.json({ ok:true });
}