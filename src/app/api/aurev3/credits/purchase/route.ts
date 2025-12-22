import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { CreditSystem } from '@/lib/aurev3/credit-system'
import { getActiveOrg } from '@/lib/org'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-07-30.basil',
})

/**
 * POST /api/aurev3/credits/purchase
 * Create Stripe checkout session for credit purchase
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const org = await getActiveOrg()
    if (!org) {
      return NextResponse.json({ error: 'Organization required' }, { status: 400 })
    }
    
    const body = await req.json()
    const { amount } = body // Amount in USD
    
    if (!amount || amount < 10) {
      return NextResponse.json(
        { error: 'Minimum purchase is $10' },
        { status: 400 }
      )
    }
    
    // Get or create Stripe customer
    const creditSystem = new CreditSystem()
    const balance = await creditSystem.getBalance(org.id)
    
    // Get customer ID from credits table or create new
    const { data: creditData } = await supabase
      .from('aurev_credits')
      .select('stripe_customer_id')
      .eq('org_id', org.id)
      .single()
    
    let customerId = creditData?.stripe_customer_id
    
    if (!customerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          org_id: org.id,
          type: 'aurev3_credits',
        },
      })
      
      customerId = customer.id
      
      // Update credits table
      await supabase
        .from('aurev_credits')
        .update({ stripe_customer_id: customerId })
        .eq('org_id', org.id)
    }
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'AUREV Credits',
              description: `${amount.toFixed(2)} AUREV Credits for AI compute and model access`,
            },
            unit_amount: Math.round(amount * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.nextUrl.origin}/aurev3/credits?success=true`,
      cancel_url: `${req.nextUrl.origin}/aurev3/credits?canceled=true`,
      metadata: {
        org_id: org.id,
        user_id: user.id,
        type: 'credit_purchase',
      },
    })
    
    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    console.error('Error creating credit purchase:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create purchase' },
      { status: 500 }
    )
  }
}

