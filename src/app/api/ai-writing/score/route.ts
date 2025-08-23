import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { AIWritingAssistant, EmailContent } from '@/lib/ai-writing-assistant'
// import { requireQuota, recordUserUsage } from '@/lib/usage'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: EmailContent = await request.json()
    const { subject, body: emailBody, tone, targetAudience, productService } = body

    // Validate input
    if (!subject || !emailBody || !tone || !targetAudience || !productService) {
      return NextResponse.json(
        { error: 'Missing required content fields' },
        { status: 400 }
      )
    }

    // Enforce daily plan limits - temporarily disabled
    // const quota = await requireQuota(user.id, 'ai_scoring')
    // if (!quota.allowed) {
    //   return NextResponse.json({ 
    //     error: 'Plan limit exceeded', 
    //     code: 'LIMIT_EXCEEDED', 
    //     plan: quota.remaining === Infinity ? 'pro' : 'free', 
    //     remaining: 0 
    //   }, { status: 402 })
    // }

    // Score email with AI
    const score = await AIWritingAssistant.scoreEmail({
      subject,
      body: emailBody,
      tone,
      targetAudience,
      productService
    })

    // Count usage only on success - temporarily disabled
    // try { 
    //   await recordUserUsage({ userId: user.id, feature: 'ai_scoring', tokens: 1 }) 
    // } catch {}

    return NextResponse.json({ 
      score,
      used: 1, // temporarily hardcoded
      quota: 100 // temporarily hardcoded
    })
  } catch (error) {
    console.error('Error scoring email with AI:', error)
    return NextResponse.json(
      { error: 'Failed to score email with AI' },
      { status: 500 }
    )
  }
} 