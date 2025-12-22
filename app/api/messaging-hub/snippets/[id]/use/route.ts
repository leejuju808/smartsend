import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'

/**
 * POST /api/messaging-hub/snippets/[id]/use
 * Track snippet usage
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { id } = await params
    const supabase = getServerSupabase()

    // Get current snippet to increment usage count
    const { data: currentSnippet } = await supabase
      .from('message_snippets')
      .select('usage_count')
      .eq('id', id)
      .single()

    // Increment usage count and update last_used_at
    const { data: snippet, error } = await supabase
      .from('message_snippets')
      .update({
        usage_count: (currentSnippet?.usage_count || 0) + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating snippet usage:', error)
      return NextResponse.json(
        { error: 'Failed to update snippet usage' },
        { status: 500 }
      )
    }

    return NextResponse.json({ snippet })
  } catch (error) {
    console.error('Error in POST /api/messaging-hub/snippets/[id]/use:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}






































