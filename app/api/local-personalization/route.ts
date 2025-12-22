/**
 * Block 13100 — Local Personalization API Endpoint
 * 
 * Returns local personalization tokens for a given contact/lead.
 * Used by edge functions and other services that need local context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateLocalPersonalizationTokens, LocalPersonalizationContext } from '@/lib/ai/local-personalization-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { city, state, zip, neighborhood, property_type } = body;

    if (!city) {
      return NextResponse.json(
        { error: 'City is required' },
        { status: 400 }
      );
    }

    const context: LocalPersonalizationContext = {
      city: city || null,
      state: state || null,
      zip: zip || null,
      neighborhood: neighborhood || null,
      property_type: property_type || null,
    };

    const tokens = await generateLocalPersonalizationTokens(context);

    return NextResponse.json({
      success: true,
      tokens,
    });
  } catch (error: any) {
    console.error('Error generating local personalization tokens:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate local personalization tokens' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const city = searchParams.get('city');
  const state = searchParams.get('state');
  const zip = searchParams.get('zip');
  const neighborhood = searchParams.get('neighborhood');
  const property_type = searchParams.get('property_type') as any;

  if (!city) {
    return NextResponse.json(
      { error: 'City is required' },
      { status: 400 }
    );
  }

  try {
    const context: LocalPersonalizationContext = {
      city: city || null,
      state: state || null,
      zip: zip || null,
      neighborhood: neighborhood || null,
      property_type: property_type || null,
    };

    const tokens = await generateLocalPersonalizationTokens(context);

    return NextResponse.json({
      success: true,
      tokens,
    });
  } catch (error: any) {
    console.error('Error generating local personalization tokens:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate local personalization tokens' },
      { status: 500 }
    );
  }
}





















































