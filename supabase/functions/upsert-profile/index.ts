import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status:405 })
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } })

  try {
    const body = await req.json()
    const { profile_id, provider, secrets } = body || {}
    if (!profile_id || !provider || !secrets) return new Response('Missing fields', { status:400 })

    // overwrite or insert
    const payload: any = { profile_id }
    if (provider === 'smtp') {
      Object.assign(payload, {
        smtp_host: secrets.host,
        smtp_port: Number(secrets.port||587),
        smtp_user: secrets.user,
        smtp_pass: secrets.pass,
        smtp_secure: !!secrets.secure
      })
    } else {
      Object.assign(payload, {
        api_key: secrets.api_key,
        domain: secrets.domain || null
      })
    }

    const { error } = await sb
      .from('sending_profile_secrets')
      .upsert(payload, { onConflict: 'profile_id' })
    if (error) {
      console.error('Upsert error:', error)
      throw error
    }

    return new Response('ok', { status:200 })
  } catch (e:any) {
    return new Response(String(e?.message || e), { status:500 })
  }
})

