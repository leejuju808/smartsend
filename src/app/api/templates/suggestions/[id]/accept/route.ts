import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const suggestionId = params.id

    // Get the suggestion and verify user owns the template
    const { data: suggestion, error: suggestionError } = await supabase
      .from('template_suggestions')
      .select(`
        *,
        email_templates!inner(user_id)
      `)
      .eq('id', suggestionId)
      .single()

    if (suggestionError || !suggestion || suggestion.email_templates.user_id !== user.id) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    // Mark suggestion as accepted
    const { error: updateError } = await supabase
      .from('template_suggestions')
      .update({ accepted: true })
      .eq('id', suggestionId)

    if (updateError) {
      console.error('Error accepting suggestion:', updateError)
      return NextResponse.json(
        { error: 'Failed to accept suggestion' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error accepting suggestion:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 