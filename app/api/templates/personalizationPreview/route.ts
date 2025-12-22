// Block 15800 — SmartSend Campaign Templates v2
// POST /api/templates/personalizationPreview - Preview template with personalization variables

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { templateId, stepOrder, tone, sampleData } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    // Fetch template step
    let query = supabase
      .from('campaign_template_steps')
      .select('*')
      .eq('template_id', templateId);

    if (stepOrder !== undefined) {
      query = query.eq('step_order', stepOrder);
    }

    if (tone) {
      query = query.eq('tone', tone);
    } else {
      query = query.eq('tone', 'default');
    }

    const { data: steps, error: stepsError } = await query.order('step_order', { ascending: true }).limit(1);

    if (stepsError || !steps || steps.length === 0) {
      return NextResponse.json({ error: 'Template step not found' }, { status: 404 });
    }

    const step = steps[0];

    // Default sample data for preview
    const defaults = {
      first_name: 'John',
      neighborhood: 'Oakwood',
      city: 'Austin',
      zip: '78701',
      last_storm_date: '2 weeks ago',
      roof_age_guess: '18 years',
      booking_link: 'https://calendly.com/yourcompany/roof-inspection',
      company_name: 'Your Roofing Company',
      claim_likelihood: 'medium',
      local_landmark: 'Main Street',
      street: 'Oakwood Drive',
      time_since_last_quote: '6 months',
    };

    const sample = { ...defaults, ...sampleData };

    // Simple template variable replacement
    let previewSubject = step.subject_template;
    let previewBody = step.body_template;

    // Replace variables
    Object.entries(sample).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      previewSubject = previewSubject.replace(regex, String(value));
      previewBody = previewBody.replace(regex, String(value));
    });

    // Handle conditional blocks (simple version - just remove them for preview)
    previewSubject = previewSubject.replace(/\{%\s*if[^%]*%\}/g, '');
    previewSubject = previewSubject.replace(/\{%\s*endif\s*%\}/g, '');
    previewSubject = previewSubject.replace(/\{%\s*else\s*%\}/g, '');
    
    previewBody = previewBody.replace(/\{%\s*if[^%]*%\}/g, '');
    previewBody = previewBody.replace(/\{%\s*endif\s*%\}/g, '');
    previewBody = previewBody.replace(/\{%\s*else\s*%\}/g, '');

    return NextResponse.json({
      preview: {
        subject: previewSubject,
        body: previewBody,
        stepOrder: step.step_order,
        tone: step.tone,
        delayDays: step.delay_days,
      },
      variables: Object.keys(sample),
    });
  } catch (error: any) {
    console.error('Error in POST /api/templates/personalizationPreview:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































