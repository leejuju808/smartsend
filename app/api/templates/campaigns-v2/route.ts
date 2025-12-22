// Block 15800 — SmartSend Campaign Templates v2
// GET /api/templates/campaigns-v2 - List all v2 campaign templates with steps

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get('category'); // Filter by category

    // Fetch templates from campaign_templates table
    let query = supabase
      .from('campaign_templates')
      .select('*')
      .eq('is_active', true)
      .eq('niche', 'roofing')
      .order('category', { ascending: true })
      .order('name', { ascending: true });

    // Filter by category if provided
    if (category) {
      query = query.eq('category', category);
    }

    const { data: templates, error: templatesError } = await query;

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    // Fetch steps for each template
    const templatesWithSteps = await Promise.all(
      (templates || []).map(async (template) => {
        const { data: steps, error: stepsError } = await supabase
          .from('campaign_template_steps')
          .select('*')
          .eq('template_id', template.id)
          .order('step_order', { ascending: true });

        if (stepsError) {
          console.error(`Error fetching steps for template ${template.id}:`, stepsError);
        }

        // Group steps by tone
        const stepsByTone: Record<string, any[]> = {};
        (steps || []).forEach((step) => {
          const tone = step.tone || 'default';
          if (!stepsByTone[tone]) {
            stepsByTone[tone] = [];
          }
          stepsByTone[tone].push({
            stepNumber: step.step_order,
            subject: step.subject_template,
            body: step.body_template,
            delayDays: step.delay_days,
            tone: step.tone,
          });
        });

        return {
          id: template.id,
          slug: template.slug,
          title: template.name,
          description: template.description,
          category: template.category,
          goal: template.goal,
          recommendedSteps: template.recommended_steps,
          personalizationRequired: template.personalization_required,
          toneOptions: template.tone_options || [],
          recommendedListTypes: template.recommended_list_types || [],
          promoTag: template.promo_tag,
          steps: stepsByTone['default'] || stepsByTone['urgent'] || stepsByTone['friendly'] || (steps || []).map(s => ({
            stepNumber: s.step_order,
            subject: s.subject_template,
            body: s.body_template,
            delayDays: s.delay_days,
            tone: s.tone,
          })),
          stepsByTone, // Include all tone variants
          tags: template.recommended_list_types || [],
        };
      })
    );

    return NextResponse.json({ templates: templatesWithSteps });
  } catch (error: any) {
    console.error('Error in GET /api/templates/campaigns-v2:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}





















































