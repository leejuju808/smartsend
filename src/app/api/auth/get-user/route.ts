import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerComponentClient()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json({ userId: user?.id ?? null })
  } catch {
    return NextResponse.json({ userId: null })
  }
}

