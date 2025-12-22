import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { job_id, rating_accuracy, rating_timeliness, rating_quality, notes } = body

    if (!rating_accuracy || !rating_timeliness || !rating_quality) {
      return NextResponse.json(
        { error: 'rating_accuracy, rating_timeliness, and rating_quality are required' },
        { status: 400 }
      )
    }

    const { data: rating, error } = await supabase
      .from('vendor_ratings')
      .insert({
        supplier_id: params.id,
        job_id,
        rating_accuracy,
        rating_timeliness,
        rating_quality,
        notes,
        created_by: user.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating vendor rating:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rating })
  } catch (error: any) {
    console.error('Error in POST /api/workforce/suppliers/[id]/ratings:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
























