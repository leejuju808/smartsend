import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * GET /api/messaging-hub/comments
 * Get internal comments for a message or thread
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id, user } = gate
    const user_id = user.id
    const supabase = getServerSupabase()
    const searchParams = req.nextUrl.searchParams
    const message_id = searchParams.get('message_id')
    const thread_id = searchParams.get('thread_id')

    if (!message_id && !thread_id) {
      return NextResponse.json(
        { error: 'message_id or thread_id is required' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('message_internal_comments')
      .select(`
        *,
        created_by_user:created_by (
          id,
          email,
          full_name
        )
      `)
      .eq('workspace_id', workspace_id)
      .order('created_at', { ascending: false })

    if (message_id) {
      query = query.eq('message_id', message_id)
    }

    if (thread_id) {
      query = query.eq('thread_id', thread_id)
    }

    const { data: comments, error } = await query

    if (error) {
      console.error('Error fetching comments:', error)
      return NextResponse.json(
        { error: 'Failed to fetch comments' },
        { status: 500 }
      )
    }

    return NextResponse.json({ comments: comments || [] })
  } catch (error) {
    console.error('Error in GET /api/messaging-hub/comments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/messaging-hub/comments
 * Create an internal comment (team note)
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id, user } = gate
    const user_id = user.id
    const supabase = getServerSupabase()

    const body = await req.json()
    const { message_id, thread_id, body: commentBody } = body

    if (!commentBody) {
      return NextResponse.json(
        { error: 'body is required' },
        { status: 400 }
      )
    }

    if (!message_id && !thread_id) {
      return NextResponse.json(
        { error: 'message_id or thread_id is required' },
        { status: 400 }
      )
    }

    const { data: comment, error } = await supabase
      .from('message_internal_comments')
      .insert({
        workspace_id,
        message_id,
        thread_id,
        body: commentBody,
        created_by: user_id
      })
      .select(`
        *,
        created_by_user:created_by (
          id,
          email,
          full_name
        )
      `)
      .single()

    if (error) {
      console.error('Error creating comment:', error)
      return NextResponse.json(
        { error: 'Failed to create comment' },
        { status: 500 }
      )
    }

    return NextResponse.json({ comment })
  } catch (error) {
    console.error('Error in POST /api/messaging-hub/comments:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

