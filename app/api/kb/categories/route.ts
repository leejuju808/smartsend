import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('kb_categories')
      .select('*')
      .eq('is_active', true)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('KB categories error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ categories: data || [] })
  } catch (error: any) {
    console.error('KB categories error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}






































