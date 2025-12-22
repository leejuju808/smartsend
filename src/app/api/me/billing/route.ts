import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({}, { status: 401 })
  const { data, error } = await supabase.from('billing_accounts')
    .select('usage_mtd, monthly_quota').eq('user_id', user.id).single()
  if (error) return NextResponse.json({}, { status: 404 })
  return NextResponse.json(data)
}

