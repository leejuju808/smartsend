import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

type Rule = { step_no: number, tone: string, length: string, persona: string, goal: string }

const DEFAULT_RULES: Rule[] = [
  { step_no: 1, tone: 'punchy',      length: 'short',  persona: 'founder',   goal: 'pattern break + clear value' },
  { step_no: 2, tone: 'professional',length: 'medium', persona: 'founder',   goal: 'social proof + value' },
  { step_no: 3, tone: 'warm',        length: 'short',  persona: 'ae',        goal: 'gentle bump' },
  { step_no: 4, tone: 'neutral',     length: 'medium', persona: 'consultant',goal: 'case study angle' },
  { step_no: 5, tone: 'casual',      length: 'short',  persona: 'sdR',       goal: 'last nudge + opt-out' },
]

export async function POST(req: Request, { params }: { params: { sequenceId: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as {
    owner_scope: 'user' | 'org', owner_id: string,
    rules?: Rule[], variant_count?: number, spam_safety?: boolean, spintax?: boolean
  }
  const rules = body.rules?.length ? body.rules : DEFAULT_RULES
  const variants = Math.min(Math.max(body.variant_count ?? 2, 1), 5)

  // Load steps
  const { data: steps, error } = await supabase
    .from('sequence_steps')
    .select('id, step_number, subject_template, body_md, sequence_id')
    .eq('sequence_id', params.sequenceId)
    .order('step_number', { ascending: true })
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!steps?.length) return NextResponse.json({ error: 'no_steps' }, { status: 400 })

  // Fire the existing template-rewrite edge per step with per-step rules
  const results: any[] = []
  for (const step of steps) {
    const r = rules.find(r => r.step_no === step.step_number) 
      || rules[Math.min(rules.length - 1, step.step_number - 1)] 
      || rules[0]
    
    // Use internal rewrite API or external edge function
    const rewriteUrl = process.env.TEMPLATE_REWRITE_URL || '/api/templates/rewrite'
    const useExternal = !!process.env.TEMPLATE_REWRITE_URL

    const payload = {
      user_id: user.id,
      owner_scope: body.owner_scope,
      owner_id: body.owner_id,
      template_id: step.id,                    // reuse step id as "template_id"
      subject: step.subject_template || '',
      body_md: step.body_md || '',
      params: {
        tone: r.tone, 
        length: r.length, 
        persona: r.persona, 
        variant_count: variants,
        spam_safety: body.spam_safety ?? true, 
        spintax: body.spintax ?? false, 
        add_unsubscribe: step.step_number >= 3,
        keep_variables: ['first_name', 'company', 'my_name', 'title', 'domain']   // common placeholders
      }
    }

    try {
      let resp: Response
      if (useExternal) {
        resp = await fetch(rewriteUrl, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify(payload)
        })
      } else {
        // Use internal rewrite API - construct absolute URL
        const origin = req.headers.get('origin') || 
          process.env.NEXT_PUBLIC_SITE_URL || 
          `http://localhost:${process.env.PORT || 3000}`
        resp = await fetch(`${origin}/api/templates/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: payload.subject,
            text: payload.body_md,
            html: payload.body_md,
            tone: r.tone,
            length: r.length,
            goal: r.goal,
            keepPlaceholders: true
          })
        })
      }

      const ok = resp.ok
      const resultData = ok ? await resp.json().catch(() => ({})) : null

      // Save version to sequence_step_versions if successful
      if (ok && resultData) {
        const versionData = {
          sequence_id: params.sequenceId,
          step_id: step.id,
          step_no: step.step_number,
          owner_scope: body.owner_scope,
          owner_id: body.owner_id,
          kind: 'optimize',
          params: payload.params,
          subject: resultData.subject || payload.subject,
          body_md: resultData.body_md || resultData.text || resultData.html || payload.body_md,
          created_by: user.id
        }

        await supabase.from('sequence_step_versions').insert(versionData).catch(err => {
          console.error('Failed to save version:', err)
        })
      }

      results.push({ 
        step_id: step.id, 
        step_no: step.step_number,
        ok, 
        status: ok ? 'ok' : await resp.text().catch(() => 'error') 
      })
    } catch (err: any) {
      results.push({ 
        step_id: step.id, 
        step_no: step.step_number,
        ok: false, 
        status: err.message || 'error' 
      })
    }
  }

  return NextResponse.json({ results })
}

