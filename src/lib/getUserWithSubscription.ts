import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string

export async function getUserWithSubscription() {
  const cookieStore = cookies()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        // Next.js server components cannot set cookies directly here
      },
      remove(name: string, options: Record<string, unknown>) {
        // No-op
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null as any, isPro: false }

  // Subscription status stored on public.users.subscription_status
  const { data: userRow } = await supabase
    .from('users')
    .select('subscription_status')
    .eq('id', user.id)
    .maybeSingle()

  const isPro = userRow?.subscription_status === 'pro' || userRow?.subscription_status === 'active'
  return { user, isPro }
}

