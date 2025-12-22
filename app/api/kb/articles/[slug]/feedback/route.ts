import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = await createClient()
    const { helpful } = await request.json()

    // Get article by slug
    const { data: article, error: articleError } = await supabase
      .from('kb_articles')
      .select('id')
      .eq('slug', params.slug)
      .single()

    if (articleError || !article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Record interaction
    await supabase.from('kb_user_interactions').insert({
      user_id: user.id,
      article_id: article.id,
      interaction_type: helpful ? 'helpful' : 'not_helpful',
    })

    // Update article counts using RPC or direct update
    const { data: currentArticle } = await supabase
      .from('kb_articles')
      .select('helpful_count, not_helpful_count')
      .eq('id', article.id)
      .single()

    if (currentArticle) {
      if (helpful) {
        await supabase
          .from('kb_articles')
          .update({ helpful_count: (currentArticle.helpful_count || 0) + 1 })
          .eq('id', article.id)
      } else {
        await supabase
          .from('kb_articles')
          .update({ not_helpful_count: (currentArticle.not_helpful_count || 0) + 1 })
          .eq('id', article.id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('KB feedback error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

