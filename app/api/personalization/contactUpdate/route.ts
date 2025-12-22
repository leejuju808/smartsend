/**
 * Block 15700 — Personalization Engine v2
 * API endpoint for rebuilding personalization when contact data updates
 * 
 * POST /api/personalization/contactUpdate
 * Body: { contactId: string, updateType: 'enrichment' | 'storm' | 'message_intelligence' | 'quote' }
 * 
 * This endpoint is called automatically when:
 * - Contact enrichment updates
 * - List intelligence updates
 * - Storm data updates
 * - Message intelligence changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, updateType } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: 'contactId is required' },
        { status: 400 }
      );
    }

    // Rebuild personalization cache
    const { data, error } = await supabaseAdmin.rpc('rebuild_personalization_cache', {
      p_contact_id: contactId,
    });

    if (error) {
      console.error('Error rebuilding personalization cache:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to rebuild personalization cache' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      contactId,
      updateType,
      cacheId: data,
      message: 'Personalization cache rebuilt successfully',
    });
  } catch (error: any) {
    console.error('Error in contactUpdate endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update personalization cache' },
      { status: 500 }
    );
  }
}





















































