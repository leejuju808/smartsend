// reply_detection_edge/index.ts
// Edge Function to detect email replies using OpenAI

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4.0.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

Deno.serve(async (req) => {
  try {
    const { record } = await req.json()
    const { id, thread_id, from_email, body_text } = record

    // ignore sent emails (only detect replies)
    if (!from_email || from_email.includes('@smartsendhq.com')) {
      return new Response('skip self emails', { status: 200 })
    }

    // Step 1: Quick AI filter
    const prompt = `Does this email sound like a human reply (yes or no)?\n\n${body_text}`
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    })

    const reply = result.choices[0].message.content?.toLowerCase().includes('yes') ?? false

    if (reply) {
      await supabase.from('emails').update({ has_replied: true }).eq('id', id)
      await supabase.from('threads').update({ status: 'Replied' }).eq('id', thread_id)
    }

    return new Response('ok', { status: 200 })
  } catch (error: any) {
    console.error('Error processing reply detection:', error)
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

