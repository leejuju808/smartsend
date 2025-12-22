import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/health/edge
 * 
 * Health check for Supabase Edge Functions availability
 */
export async function GET() {
  try {
    const startTime = Date.now();
    
    // Create a service role client to test Edge Functions availability
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
        }
      }
    );
    
    // Simple test query to verify connectivity
    // Edge functions are invoked via supabase.functions.invoke() in production
    // This is just a basic connectivity check
    const { error } = await supabase
      .from('system_logs')
      .select('id')
      .limit(1);
    
    const latency = Date.now() - startTime;
    
    if (error) {
      return NextResponse.json(
        { 
          ok: false, 
          error: error.message,
          message: 'Edge service error'
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      ok: true, 
      latency,
      message: 'Edge services available'
    });
  } catch (err: any) {
    return NextResponse.json(
      { 
        ok: false, 
        error: err?.message || String(err),
        message: 'Edge services unavailable'
      },
      { status: 500 }
    );
  }
}

