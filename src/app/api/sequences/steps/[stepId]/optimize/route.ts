import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request, { params }: { params: { stepId: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const b = await req.json() as {
    owner_scope: 'user' | 'org', owner_id: string,
    subject?: string, body_md: string,
    params: any, keep_variables?: string[]
  }

  // Get step info for context
  const { data: step } = await supabase
    .from('sequence_steps')
    .select('id, step_number, sequence_id, subject_template, body_md')
    .eq('id', params.stepId)
    .single()

  if (!step) return NextResponse.json({ error: 'step_not_found' }, { status: 404 })

  const subject = b.subject ?? step.subject_template ?? ''
  const body_md = b.body_md || step.body_md || ''

  // Use internal rewrite API or external edge function
  const rewriteUrl = process.env.TEMPLATE_REWRITE_URL || '/api/templates/rewrite'
  const useExternal = !!process.env.TEMPLATE_REWRITE_URL

  const payload = {
    user_id: user.id,
    template_id: params.stepId,
    owner_scope: b.owner_scope,
    owner_id: b.owner_id,
    subject,
    body_md,
    params: { 
      ...b.params, 
      keep_variables: b.keep_variables ?? ['first_name', 'company', 'my_name', 'title', 'domain'] 
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
            tone: b.params?.tone || 'professional',
            length: b.params?.length || 'medium',
            goal: b.params?.goal || 'engage',
            keepPlaceholders: true
          })
        })
      }

    if (!resp.ok) {
      return NextResponse.json({ error: await resp.text().catch(() => 'Rewrite failed') }, { status: 400 })
    }

    const resultData = await resp.json().catch(() => ({}))
    
    // Generate multiple variants by calling multiple times or using variant_count
    const variantCount = Math.min(Math.max(b.params?.variant_count || 2, 1), 5)
    const versions: any[] = []

    for (let i = 0; i < variantCount; i++) {
      let variantResp: Response
      
      if (useExternal && variantCount > 1 && i > 0) {
        // Call external API for each variant
        variantResp = await fetch(rewriteUrl, {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({ ...payload, params: { ...payload.params, variant_index: i } })
        })
      } else if (i === 0) {
        // First variant is already in resultData
        versions.push({
          id: crypto.randomUUID(),
          params: b.params,
          subject: resultData.subject || subject,
          body_md: resultData.body_md || resultData.text || resultData.html || body_md,
          created_at: new Date().toISOString()
        })
        continue
      } else {
        // For internal API, generate variants with slight parameter variations
        const origin = req.headers.get('origin') || 
          process.env.NEXT_PUBLIC_SITE_URL || 
          `http://localhost:${process.env.PORT || 3000}`
        variantResp = await fetch(`${origin}/api/templates/rewrite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            text: body_md,
            html: body_md,
            tone: ['professional', 'friendly', 'direct', 'warm', 'casual'][i % 5],
            length: ['short', 'medium', 'long'][i % 3],
            goal: b.params?.goal || 'engage',
            keepPlaceholders: true
          })
        })
      }

      if (variantResp && variantResp.ok) {
        const variantData = await variantResp.json().catch(() => ({}))
        versions.push({
          id: crypto.randomUUID(),
          params: { ...b.params, variant_index: i },
          subject: variantData.subject || subject,
          body_md: variantData.body_md || variantData.text || variantData.html || body_md,
          created_at: new Date().toISOString()
        })
      }
    }

    // If we only got one result, duplicate it as variants
    if (versions.length === 0 && resultData) {
      versions.push({
        id: crypto.randomUUID(),
        params: b.params,
        subject: resultData.subject || subject,
        body_md: resultData.body_md || resultData.text || resultData.html || body_md,
        created_at: new Date().toISOString()
      })
    }

    // Save versions to sequence_step_versions
    if (versions.length > 0) {
      const versionInserts = versions.map(v => ({
        sequence_id: step.sequence_id,
        step_id: params.stepId,
        step_no: step.step_number,
        owner_scope: b.owner_scope,
        owner_id: b.owner_id,
        kind: 'optimize',
        params: v.params,
        subject: v.subject,
        body_md: v.body_md,
        created_by: user.id
      }))

      await supabase.from('sequence_step_versions').insert(versionInserts).catch(err => {
        console.error('Failed to save versions:', err)
      })
    }

    // Get latest versions from DB
    const { data: dbVersions } = await supabase
      .from('sequence_step_versions')
      .select('id, params, subject, body_md, created_at')
      .eq('step_id', params.stepId)
      .order('created_at', { ascending: false })
      .limit(5)

    return NextResponse.json({ versions: dbVersions || versions })
  } catch (err: any) {
    console.error('Optimize error:', err)
    return NextResponse.json({ error: err.message || 'Optimize failed' }, { status: 500 })
  }
}

