import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { generateColdEmails, EmailGenerationParams } from '@/lib/openai'
import { requireQuota, recordUsage } from '@/lib/usage'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { targetAudience, productService, tone }: EmailGenerationParams = body

    // Validate input
    if (!targetAudience || !productService || !tone) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Enforce daily plan limits
    const quota = await requireQuota('emails')
    if (!quota.allowed) {
      return NextResponse.json({ error: 'Plan limit exceeded', code: 'LIMIT_EXCEEDED', plan: quota.remaining === Infinity ? 'pro' : 'free', remaining: 0 }, { status: 402 })
    }

    // Generate emails
    const emails = await generateColdEmails({
      targetAudience,
      productService,
      tone
    })

    // Save to database
    const { error: dbError } = await supabase
      .from('email_templates')
      .insert({
        user_id: user.id,
        target_audience: targetAudience,
        product_service: productService,
        tone: tone,
        generated_emails: emails
      })

    if (dbError) {
      console.error('Database error:', dbError)
      // Don't fail the request if DB save fails
    }

    // Count only on success
    try { await recordUsage(user.id, 'emails', 1) } catch {}
    return NextResponse.json({ emails, used: (quota.used ?? 0) + 1, quota: quota.quota })
  } catch (error) {
    console.error('Error generating emails:', error)
    return NextResponse.json(
      { error: 'Failed to generate emails' },
      { status: 500 }
    )
  }
} 