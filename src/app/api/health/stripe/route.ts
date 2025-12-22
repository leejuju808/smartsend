import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

/**
 * GET /api/health/stripe
 * 
 * Health check for Stripe API connectivity
 */
export async function GET() {
  try {
    const startTime = Date.now();
    
    // Lightweight API call to test connectivity
    await stripe.prices.list({ limit: 1 });
    
    const latency = Date.now() - startTime;
    
    return NextResponse.json({ 
      ok: true, 
      latency,
      message: 'Stripe API is reachable'
    });
  } catch (err: any) {
    return NextResponse.json(
      { 
        ok: false, 
        error: err?.message || String(err),
        message: 'Stripe API is unreachable'
      },
      { status: 500 }
    );
  }
}
