import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { PersonalizeAI, PersonalizeInput } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/personalize
 * Generate personalized email/message content
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: PersonalizeInput = await req.json()

    // Validate required fields
    if (!body.contentType || !body.homeownerInfo) {
      return NextResponse.json(
        { error: 'Missing required fields: contentType, homeownerInfo' },
        { status: 400 }
      )
    }

    // Generate personalized content
    const result = await PersonalizeAI.personalize(body)

    // Log AI communication
    try {
      await supabase.from('ai_communication_logs').insert({
        workspace_id,
        module: 'personalize',
        input: JSON.stringify(body),
        output: JSON.stringify(result),
        metadata: {
          contentType: body.contentType,
          personalizationScore: result.personalizationScore
        }
      })
    } catch (logError) {
      console.error('Failed to log AI communication:', logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/personalize:', error)
    return NextResponse.json(
      { error: 'Failed to generate personalized content' },
      { status: 500 }
    )
  }
}

























