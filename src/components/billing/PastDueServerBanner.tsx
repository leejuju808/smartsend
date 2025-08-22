import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export default async function PastDueServerBanner() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  if (!supabaseUrl || !supabaseAnonKey) return null
  const jar = cookies()
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return jar.get(name)?.value
        },
        set() {},
        remove() {},
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: row } = await supabase
      .from('users')
      .select('subscription_status')
      .eq('id', user.id)
      .maybeSingle()
    if (!row || row.subscription_status !== 'past_due') return null
  } catch {
    return null
  }

  return (
    <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        <p className="text-sm">Your payment method needs attention. Update billing to restore full access.</p>
        <a href="/dashboard/billing" className="w-40 px-3 py-2 rounded bg-amber-700 text-white text-sm text-center">Update billing</a>
      </div>
    </div>
  )
}

