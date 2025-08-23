import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AIWritingAssistant, OptimizationRequest } from '@/lib/ai-writing-assistant'
import { requireQuota, recordUserUsage } from '@/lib/usage'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: OptimizationRequest = await request.json()
    const { content, focusAreas, targetScore } = body

    // Validate input
    if (!content?.subject || !content?.body || !content?.tone || !content?.targetAudience || !content?.productService) {
      return NextResponse.json(
        { error: 'Missing required content fields' },
        { status: 400 }
      )
    }

    // Enforce daily plan limits
    const quota = await requireQuota(user.id, 'ai_optimization')
    if (!quota.allowed) {
      return NextResponse.json({ 
        error: 'Plan limit exceeded', 
        code: 'LIMIT_EXCEEDED', 
        plan: quota.remaining === Infinity ? 'pro' : 'free', 
        remaining: 0 
      }, { status: 402 })
    }

    // Generate AI suggestions
    const result = await AIWritingAssistant.generateSuggestions({
      content,
      focusAreas,
      targetScore
    })

    // Save suggestions to database if template_id is provided
    if (body.templateId) {
      try {
        const suggestions = result.suggestions.map(s => ({
          template_id: body.templateId,
          suggestion: s.content,
          suggestion_type: s.type,
          ai_score: s.score
        }))

        await supabase
          .from('template_suggestions')
          .insert(suggestions)

        // Update template with performance notes
        await supabase
          .from('email_templates')
          .update({ 
            performance_notes: result.performance_notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', body.templateId)
      } catch (dbError) {
        console.error('Database error saving suggestions:', dbError)
        // Don't fail the request if DB save fails
      }
    }

    // Count usage only on success
    try { 
      await recordUserUsage({ userId: user.id, feature: 'ai_optimization', tokens: 1 }) 
    } catch {}

    return NextResponse.json({ 
      ...result,
      used: (quota.used ?? 0) + 1, 
      quota: quota.quota 
    })
  } catch (error) {
    console.error('Error optimizing with AI:', error)
    return NextResponse.json(
      { error: 'Failed to optimize with AI' },
      { status: 500 }
    )
  }
} 