import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderSubjectAndHtml } from '@/lib/renderTemplate'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { vars } = await req.json()
    if (!params.id) return NextResponse.json({ ok: false, error: 'Missing template id' }, { status: 400 })

    const { data: tpl, error } = await supabase
      .from('email_templates')
      .select('subject, body_html')
      .eq('id', params.id)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    if (!tpl) return NextResponse.json({ ok: false, error: 'Template not found' }, { status: 404 })

    const subjectTpl = String(tpl.subject ?? '')
    const bodyTpl = String(tpl.body_html ?? '')

    const { subject, html, missing } = renderSubjectAndHtml(subjectTpl, bodyTpl, vars || {})

    return NextResponse.json({ ok: true, subject, html, missing, status: 'ok' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Failed to render preview' }, { status: 500 })
  }
}


