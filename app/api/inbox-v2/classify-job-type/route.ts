import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { requireWorkspace } from '@/lib/workspace/withWorkspace'
import { classifyJobType } from '@/src/lib/ai/jobTypeClassifier'

/**
 * POST /api/inbox-v2/classify-job-type
 * Analyze a thread and classify its job type
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req)
    if ('error' in gate) return gate.error

    const { workspace_id } = gate
    const supabase = getServerSupabase()

    const body = await req.json()
    const { thread_id, message_id, text, subject } = body

    if (!thread_id && !text) {
      return NextResponse.json(
        { error: 'thread_id or text is required' },
        { status: 400 }
      )
    }

    let messageText = text
    let messageSubject = subject
    let threadId = thread_id

    // If thread_id provided, fetch the latest message
    if (thread_id && !text) {
      const { data: thread } = await supabase
        .from('inbox_threads')
        .select('id, campaign_id, lead_id')
        .eq('id', thread_id)
        .single()

      if (!thread) {
        return NextResponse.json(
          { error: 'Thread not found' },
          { status: 404 }
        )
      }

      // Get latest inbound message
      const { data: messages } = await supabase
        .from('inbox_messages')
        .select('body_text, body_html, subject')
        .eq('thread_id', thread_id)
        .eq('direction', 'in')
        .order('sent_at', { ascending: false })
        .limit(1)

      if (messages && messages.length > 0) {
        messageText = messages[0].body_text || messages[0].body_html || ''
        messageSubject = messages[0].subject || undefined
      } else {
        return NextResponse.json(
          { error: 'No messages found in thread' },
          { status: 404 }
        )
      }
    }

    if (!messageText) {
      return NextResponse.json(
        { error: 'No text to analyze' },
        { status: 400 }
      )
    }

    // Get context if thread_id available
    let context: {
      zipCode?: string
      homeDescription?: string
      hasPhotos?: boolean
    } = {}

    if (threadId) {
      const { data: thread } = await supabase
        .from('inbox_threads')
        .select(`
          id,
          lead_id,
          campaign_id,
          lead:lead_id (
            zip_code,
            address,
            city,
            state
          )
        `)
        .eq('id', threadId)
        .single()

      if (thread?.lead) {
        context.zipCode = (thread.lead as any).zip_code
        if ((thread.lead as any).address) {
          context.homeDescription = [
            (thread.lead as any).address,
            (thread.lead as any).city,
            (thread.lead as any).state
          ].filter(Boolean).join(', ')
        }
      }

      // Check for photos (you may need to adjust this based on your schema)
      const { count } = await supabase
        .from('inbox_messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', threadId)
        .contains('attachments', [{}])
      
      context.hasPhotos = (count || 0) > 0
    }

    // Classify job type
    const classification = await classifyJobType(
      messageText,
      messageSubject,
      context
    )

    // Update thread with classification if thread_id provided
    if (threadId) {
      const updateData: any = {
        job_type: classification.jobType,
        job_subcategory: classification.subcategory,
        severity_level: classification.severityLevel,
        insurance_vs_retail: classification.insuranceVsRetail,
        missing_information: classification.missingInformation,
        job_type_metadata: {
          confidence: classification.jobTypeConfidence,
          subcategory_confidence: classification.subcategoryConfidence,
          severity_confidence: classification.severityConfidence,
          insurance_confidence: classification.insuranceVsRetailConfidence,
          detected_keywords: classification.detectedKeywords,
          reasoning: classification.reasoning,
          suggested_workflow: classification.suggestedWorkflow,
        },
        job_type_classified_at: new Date().toISOString(),
      }

      // Update estimated value if it's different or not set
      const estimatedValue = Math.round(
        (classification.estimatedValue.min + classification.estimatedValue.max) / 2
      )
      
      // Only update if current value is null or significantly different
      const { data: currentThread } = await supabase
        .from('inbox_threads')
        .select('thread_estimated_value')
        .eq('id', threadId)
        .single()

      if (!currentThread?.thread_estimated_value || 
          Math.abs(currentThread.thread_estimated_value - estimatedValue) > 1000) {
        updateData.thread_estimated_value = estimatedValue
      }

      await supabase
        .from('inbox_threads')
        .update(updateData)
        .eq('id', threadId)
    }

    return NextResponse.json({
      classification,
      updated: !!threadId
    })

  } catch (error) {
    console.error('Error classifying job type:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to classify job type' },
      { status: 500 }
    )
  }
}



















































