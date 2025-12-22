import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId, rating, title, body } = await req.json();

    if (!templateId || !rating) {
      return NextResponse.json({ error: 'Template ID and rating are required' }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    // Check if user has installed this template
    const { data: install, error: installError } = await supabase
      .from('marketplace_installs')
      .select('id')
      .eq('template_id', templateId)
      .eq('user_id', user.id)
      .single();

    if (installError || !install) {
      return NextResponse.json({ error: 'You must install this template before reviewing it' }, { status: 403 });
    }

    // Upsert review (insert or update)
    const { data: review, error: reviewError } = await supabase
      .from('marketplace_reviews')
      .upsert(
        {
          template_id: templateId,
          user_id: user.id,
          rating,
          title,
          body,
        },
        { onConflict: 'template_id,user_id' }
      )
      .select()
      .single();

    if (reviewError) throw reviewError;

    // Recalculate average rating for template
    const { data: reviews } = await supabase
      .from('marketplace_reviews')
      .select('rating')
      .eq('template_id', templateId);

    if (reviews && reviews.length > 0) {
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      
      await supabase
        .from('marketplace_templates')
        .update({ rating: avgRating })
        .eq('id', templateId);
    }

    // Emit analytics event
    console.log('review_submitted', { userId: user.id, templateId, rating });

    return NextResponse.json({
      success: true,
      review,
      avgRating: reviews ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : rating,
    });

  } catch (error) {
    console.error('Review submission error:', error);
    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    );
  }
} 