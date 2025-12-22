import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { CreditSystem } from '@/lib/aurev3/credit-system'
import { getActiveOrg } from '@/lib/org'

/**
 * GET /api/aurev3/credits/balance
 * Get credit balance for organization
 */
export async function GET(req: NextRequest) {
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
    
    const creditSystem = new CreditSystem()
    const balance = await creditSystem.getBalance(org.id)
    
    return NextResponse.json({ balance })
  } catch (error) {
    console.error('Error fetching credit balance:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch balance' },
      { status: 500 }
    )
  }
}

