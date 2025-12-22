import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * POST /api/campaign/localize
 * 
 * Localizes campaign content with:
 * - City references
 * - Neighborhood names
 * - ZIP codes
 * - Local landmarks
 * - Service area context
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      html,
      text,
      city,
      neighborhood,
      zip,
      state,
      serviceArea,
    } = body;

    if (!html && !text) {
      return NextResponse.json(
        { error: 'html or text is required' },
        { status: 400 }
      );
    }

    let localizedHtml = html || '';
    let localizedText = text || '';
    const localizations: string[] = [];

    // Inject city references
    if (city) {
      localizedHtml = localizedHtml.replace(/in your area/gi, `in ${city}`);
      localizedText = localizedText.replace(/in your area/gi, `in ${city}`);
      localizedHtml = localizedHtml.replace(/your area/gi, city);
      localizedText = localizedText.replace(/your area/gi, city);
      localizations.push(`City: ${city}`);
    }

    // Inject neighborhood references
    if (neighborhood) {
      localizedHtml = localizedHtml.replace(/in your neighborhood/gi, `in ${neighborhood}`);
      localizedText = localizedText.replace(/in your neighborhood/gi, `in ${neighborhood}`);
      localizedHtml = localizedHtml.replace(/\{\{neighborhood\}\}/gi, neighborhood);
      localizedText = localizedText.replace(/\{\{neighborhood\}\}/gi, neighborhood);
      localizations.push(`Neighborhood: ${neighborhood}`);
    }

    // Inject ZIP references
    if (zip) {
      localizedHtml = localizedHtml.replace(/\{\{zip\}\}/gi, zip);
      localizedText = localizedText.replace(/\{\{zip\}\}/gi, zip);
      localizations.push(`ZIP: ${zip}`);
    }

    // Inject service area context
    if (serviceArea?.city) {
      const areaRef = `serving ${serviceArea.city}`;
      if (!localizedHtml.includes(areaRef)) {
        localizedHtml = localizedHtml.replace(/(<p>)/, `<p>${areaRef}, `);
        localizedText = localizedText.replace(/^/, `${areaRef}, `);
        localizations.push(`Service area: ${serviceArea.city}`);
      }
    }

    // Add local examples based on city
    if (city) {
      const examples: Record<string, string> = {
        'Spokane': "Roofs in Spokane's Five Mile area often see shingle wear from wind exposure.",
        'Seattle': "Homes in Seattle's neighborhoods often need attention after our rainy winters.",
      };

      if (examples[city] && !localizedHtml.includes(examples[city])) {
        localizedHtml = localizedHtml.replace(/(<p>)/, `<p>${examples[city]} `);
        localizedText = localizedText.replace(/^/, `${examples[city]} `);
        localizations.push(`Local example added for ${city}`);
      }
    }

    return NextResponse.json({
      html: localizedHtml,
      text: localizedText,
      localizations,
    });
  } catch (error: any) {
    console.error('Localization error:', error);
    return NextResponse.json(
      { error: error.message || 'Localization failed' },
      { status: 500 }
    );
  }
}





















































