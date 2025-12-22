import { NextRequest, NextResponse } from 'next/server';
import { scoreSpammy, rewriteSafer, tighten } from '@/lib/composer/spamSafe';

export async function POST(req: NextRequest) {
  try {
    const { subject, body } = await req.json();
    const score = scoreSpammy(`${subject}\n${body}`);
    return NextResponse.json({
      ok: true,
      score,
      suggestions: [rewriteSafer(subject), tighten(body)].filter(Boolean)
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'lint failed' }, { status: 500 });
  }
} 