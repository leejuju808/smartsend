import { NextRequest, NextResponse } from 'next/server';
import { composeSequence } from '@/lib/composer/llm';
import { spamSafePair } from '@/lib/composer/spamSafe';
import { SequenceDraftSchema } from '@/lib/composer/schema';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { prompt, tone = 'direct' } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    let draft = await composeSequence({ prompt, tone });

    // spam‑safe rewrite pass on each step
    draft = {
      ...draft,
      steps: draft.steps.map((s: any) => {
        const text = s.text_template || '';
        const html = s.html_template || '';
        const subj = s.subject_template || '';
        const safeSubj = spamSafePair({ subject: subj, body: text }).subject;
        const safeText = spamSafePair({ subject: subj, body: text }).body;
        const safeHtml = html || `<p>${safeText}</p>`;
        return { ...s, subject_template: safeSubj, text_template: safeText, html_template: safeHtml };
      })
    };

    // Validate shape and return
    const valid = SequenceDraftSchema.parse(draft);
    return NextResponse.json({ ok: true, draft: valid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'compose failed' }, { status: 500 });
  }
} 