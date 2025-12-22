import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * GET /api/messaging-hub/snippets
 * Get quick snippets (pre-written roofing responses)
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()
    const searchParams = req.nextUrl.searchParams
    const category = searchParams.get('category')

    // Build query - get workspace-specific snippets and global snippets
    let query = supabase
      .from('message_snippets')
      .select('*')
      .or(`workspace_id.eq.${workspace_id},workspace_id.is.null`)
      .order('usage_count', { ascending: false })
      .order('snippet_name', { ascending: true })

    if (category) {
      query = query.eq('category', category)
    }

    const { data: snippets, error } = await query

    if (error) {
      console.error('Error fetching snippets:', error)
      return NextResponse.json(
        { error: 'Failed to fetch snippets' },
        { status: 500 }
      )
    }

    return NextResponse.json({ snippets: snippets || [] })
  } catch (error) {
    console.error('Error in GET /api/messaging-hub/snippets:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/messaging-hub/snippets
 * Create a new snippet
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { snippet_key, snippet_name, snippet_text, category } = body

    if (!snippet_key || !snippet_name || !snippet_text) {
      return NextResponse.json(
        { error: 'snippet_key, snippet_name, and snippet_text are required' },
        { status: 400 }
      )
    }

    const { data: snippet, error } = await supabase
      .from('message_snippets')
      .insert({
        workspace_id,
        snippet_key,
        snippet_name,
        snippet_text,
        category: category || 'general'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating snippet:', error)
      return NextResponse.json(
        { error: 'Failed to create snippet' },
        { status: 500 }
      )
    }

    return NextResponse.json({ snippet })
  } catch (error) {
    console.error('Error in POST /api/messaging-hub/snippets:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}


