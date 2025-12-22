import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const triggerType = searchParams.get('trigger_type')

    if (!triggerType) {
      return NextResponse.json({ error: 'trigger_type required' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('get_contextual_help', {
      trigger_type_param: triggerType,
      user_context: {},
    })

    if (error) {
      console.error('KB contextual help error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ articles: data || [] })
  } catch (error: any) {
    console.error('KB contextual help error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}






































