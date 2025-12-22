import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * Copies a sequence_template (by slug) into the user's sequences table.
 * Assumes an existing `sequences` table with:
 *   id uuid PK default gen_random_uuid()
 *   owner uuid -> auth.users.id
 *   title text
 *   steps jsonb  -- same structure as content.emails
 *   niche text   -- optional
 *   created_at timestamptz default now()
 */
export async function POST(req: NextRequest) {
  const sb = createRouteHandlerClient({ cookies });
  const { slug } = await req.json().catch(() => ({ slug: null as string | null }));

  if (!slug) {
    return new NextResponse('Missing slug', { status: 400 });
  }

  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Fetch template
  const { data: tmpl, error: tErr } = await sb
    .from('sequence_templates')
    .select('*')
    .eq('slug', slug)
    .single();

  if (tErr || !tmpl) {
    return new NextResponse('Template not found', { status: 404 });
  }

  // Derive sequence payload
  const title = tmpl.title;
  const steps = tmpl.content?.emails ?? [];
  const niche = tmpl.niche;

  // Insert into sequences (must exist with RLS owner = auth.uid())
  const { error: insErr } = await sb.from('sequences').insert({
    owner: user.id,
    title,
    steps,
    niche,
  });

  if (insErr) {
    return new NextResponse('Insert failed: ' + insErr.message, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}