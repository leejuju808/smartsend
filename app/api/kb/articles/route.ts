import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const slug = searchParams.get('slug')

    let query = supabase
      .from('kb_articles')
      .select('*')
      .eq('is_published', true)
      .order('order_index', { ascending: true })

    if (category) {
      query = query.eq('category', category)
    }

    if (slug) {
      query = query.eq('slug', slug).single()
    }

    const { data, error } = await query

    if (error) {
      console.error('KB articles error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Record view if slug is provided
    if (slug && data) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await supabase.rpc('record_kb_view', {
          article_id_param: data.id,
          user_id_param: user.id,
        })
      }
    }

    return NextResponse.json({ articles: slug ? [data] : data || [] })
  } catch (error: any) {
    console.error('KB articles error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}






































