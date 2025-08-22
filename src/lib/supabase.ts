import { createClient } from '@supabase/supabase-js'
import { createBrowserClient, createServerClient } from '@supabase/ssr'

// Debug environment variables
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Supabase Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
console.log('Supabase Service Role Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Not set');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side Supabase client
export const createClientComponentClient = () => {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Server-side Supabase client (for route handlers and server components)
export const createServerComponentClient = () => {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        // This will be overridden in server components
        return undefined
      },
      set() {},
      remove() {},
    },
  })
}

// Admin client for server-side operations
export const createAdminClient = () => {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
} 