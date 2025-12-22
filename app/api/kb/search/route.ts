import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''

    if (!query || query.length < 2) {
      return NextResponse.json({ articles: [] })
    }

    // Search articles using the database function
    const { data, error } = await supabase.rpc('search_kb_articles', {
      search_query: query,
    })

    if (error) {
      console.error('KB search error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log search query (optional, for analytics)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('kb_search_queries').insert({
        user_id: user.id,
        query,
        results_count: data?.length || 0,
      })
    }

    return NextResponse.json({ articles: data || [] })
  } catch (error: any) {
    console.error('KB search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}






































