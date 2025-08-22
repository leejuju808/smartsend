import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const templateId = searchParams.get('template_id')
    
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: comments, error } = await supabase
      .from('template_comments')
      .select(`
        *,
        user:users(email)
      `)
      .eq('template_id', templateId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ comments })
  } catch (error) {
    console.error('Error fetching template comments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { template_id, comment } = await request.json()
    
    if (!template_id || !comment) {
      return NextResponse.json({ error: 'Template ID and comment are required' }, { status: 400 })
    }

    const supabase = createRouteHandlerClient({ cookies })
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user has access to this template
    const { data: template } = await supabase
      .from('email_templates')
      .select('workspace_id')
      .eq('id', template_id)
      .single()

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const { data: commentData, error } = await supabase
      .from('template_comments')
      .insert({
        template_id,
        user_id: user.id,
        comment
      })
      .select()
      .single()

    if (error) throw error

    // Log team activity
    if (template.workspace_id) {
      await supabase.rpc('log_team_activity', {
        p_workspace_id: template.workspace_id,
        p_action: 'added_comment',
        p_entity_type: 'template',
        p_entity_id: template_id,
        p_details: { comment: comment.substring(0, 100) }
      })
    }

    return NextResponse.json({ comment: commentData })
  } catch (error) {
    console.error('Error creating template comment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 