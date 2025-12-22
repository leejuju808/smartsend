import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({}, { status: 401 })
  
  const { data, error } = await supabase.rpc('user_campaign_role', { 
    p_campaign: params.id,
    p_user: user.id
  })
  
  if (error) return NextResponse.json({ role: null }, { status: 200 })
  return NextResponse.json({ role: data })
}
