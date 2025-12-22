import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { summarizeCustomerMessage, SummarizeInput } from '@/lib/ai-models'
import { getServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/ai/summarize
 * Summarize customer message and suggest response
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { user, workspace_id } = gate
    const supabase = getServerSupabase()

    const body: SummarizeInput = await req.json()

    if (!body.message) {
      return NextResponse.json(
        { error: 'Missing required field: message' },
        { status: 400 }
      )
    }

    // Summarize the message
    const result = await summarizeCustomerMessage(body)

    // Log AI communication
    try {
      await supabase.from('ai_communication_logs').insert({
        workspace_id,
        module: 'summarize',
        input: body.message,
        output: JSON.stringify(result),
        metadata: {
          urgency: result.urgency,
          sentiment: result.sentiment,
          jobId: body.context?.jobId,
          leadId: body.context?.leadId
        }
      })
    } catch (logError) {
      console.error('Failed to log AI communication:', logError)
      // Don't fail the request if logging fails
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/ai/summarize:', error)
    return NextResponse.json(
      { error: 'Failed to summarize message' },
      { status: 500 }
    )
  }
}

























