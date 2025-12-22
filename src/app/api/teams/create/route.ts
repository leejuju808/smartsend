import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const { name, userId } = await req.json()
    
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get user from auth if not provided
    const cookieStore = await cookies()
    const { createServerClient } = await import("@supabase/ssr")
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (k) => cookieStore.get(k)?.value,
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    
    const finalUserId = userId || user?.id
    if (!finalUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create team
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: team, error } = await supabaseAdmin
      .from('teams')
      .insert({ name, owner_id: finalUserId })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Add creator as owner
    await supabaseAdmin
      .from('team_members')
      .insert({ team_id: team.id, user_id: finalUserId, role: 'owner' })

    return NextResponse.json(team)
  } catch (error: any) {
    console.error('Error creating team:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

