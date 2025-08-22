import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(
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

    const templateId = params.id

    // Verify user owns this template
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('id, user_id')
      .eq('id', templateId)
      .single()

    if (templateError || !template || template.user_id !== user.id) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Get suggestions for this template
    const { data: suggestions, error: suggestionsError } = await supabase
      .from('template_suggestions')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })

    if (suggestionsError) {
      console.error('Error fetching suggestions:', suggestionsError)
      return NextResponse.json(
        { error: 'Failed to fetch suggestions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ suggestions: suggestions || [] })
  } catch (error) {
    console.error('Error in suggestions endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 