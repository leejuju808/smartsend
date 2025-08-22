import 'server-only'
import { createClient } from '@supabase/supabase-js'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function track(name: string, context: Record<string, unknown> = {}) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('[analytics.track]', name, context || {})
    }
  } catch {}
  try {
    const supabase = admin()
    const userId = (context as any)?.userId ?? null
    await supabase.from('analytics_events').insert({ name, context, user_id: userId })
  } catch {
    // best-effort only
  }
}

