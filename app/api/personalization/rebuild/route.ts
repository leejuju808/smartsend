/**
 * Block 15700 — Personalization Engine v2
 * API endpoint for rebuilding personalization cache
 * 
 * POST /api/personalization/rebuild
 * Body: { contactId?: string, contactIds?: string[] }
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
    const { contactId, contactIds } = body;

    if (!contactId && (!contactIds || contactIds.length === 0)) {
      return NextResponse.json(
        { error: 'contactId or contactIds array is required' },
        { status: 400 }
      );
    }

    const idsToProcess = contactId ? [contactId] : contactIds;
    const results: Array<{ contactId: string; success: boolean; error?: string }> = [];

    for (const id of idsToProcess) {
      try {
        const { data, error } = await supabaseAdmin.rpc('rebuild_personalization_cache', {
          p_contact_id: id,
        });

        if (error) {
          results.push({
            contactId: id,
            success: false,
            error: error.message,
          });
        } else {
          results.push({
            contactId: id,
            success: true,
          });
        }
      } catch (err: any) {
        results.push({
          contactId: id,
          success: false,
          error: err.message || 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      processed: idsToProcess.length,
      succeeded: successCount,
      failed: failureCount,
      results,
    });
  } catch (error: any) {
    console.error('Error rebuilding personalization cache:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to rebuild personalization cache' },
      { status: 500 }
    );
  }
}





















































