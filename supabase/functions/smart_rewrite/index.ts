import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

type Req = {
  user_id: string
  template_id: string
  base_subject: string
  base_body: string
  variant_count?: number
  tone?: 'concise'|'friendly'|'direct'|'curious'|'authoritative'
  constraints?: { max_words?: number; keep_tokens?: string[] } // e.g. ["{{first_name}}","{{company}}"]
}

async function rewritePrompt(r: Req) {
  const keep = (r.constraints?.keep_tokens || []).join(', ')
  const maxw = r.constraints?.max_words ?? 130
  const tone = r.tone ?? 'concise'
  return `You are rewriting a cold email for B2B outreach.

REQUIREMENTS:
- Preserve merge tokens exactly: ${keep || '(none)'}
- Keep it under ${maxw} words in the body.
- Tone: ${tone}.
- Output JSON with an array "variants", each having {label, subject, body}. No extra commentary.

BASE SUBJECT:
${r.base_subject}

BASE BODY:
${r.base_body}

Generate ${r.variant_count ?? 2} strong variants. Label first one "Variant A", next "Variant B", etc. Include one tighter/shorter option.`
}

async function openaiJson(prompt: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: 'You are a helpful cold email copywriter.' }, { role: 'user', content: prompt }]
    })
  })
  if (!res.ok) throw new Error(await res.text())
  const json = await res.json()
  return JSON.parse(json.choices[0].message.content || '{}')
}

Deno.serve(async (req) => {
  try {
    const payload = (await req.json()) as Req
    const prompt = await rewritePrompt(payload)
    const out = await openaiJson(prompt)
    const variants = Array.isArray(out.variants) ? out.variants : []

    // Insert variants tied to template
    const rows = variants.map((v: any) => ({
      user_id: payload.user_id,
      template_id: payload.template_id,
      label: v.label || 'Variant',
      subject: v.subject?.trim() || payload.base_subject,
      body: v.body?.trim() || payload.base_body,
      source: 'ai' as const
    }))

    const { data, error } = await supabase.from('template_variants').insert(rows).select('id,label,subject,body')
    if (error) throw error

    return new Response(JSON.stringify({ ok: true, variants: data }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})

