import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('templates')
      .select('id, name, body, created_at')
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching templates:', error)
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
    }

    return NextResponse.json({ templates: data || [] })
  } catch (e: any) {
    console.error('Error in templates/list:', e)
    return NextResponse.json({ error: e.message || 'Failed to fetch templates' }, { status: 500 })
  }
}
