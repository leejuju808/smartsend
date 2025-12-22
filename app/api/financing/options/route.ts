/**
 * GET /api/financing/options
 * Get financing options for a given amount (no soft pull required)
 * Used for payment plan calculator
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStandardFinancingOptions } from '@/lib/financing/lenders';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const amount = searchParams.get('amount');
    const state = searchParams.get('state');

    if (!amount) {
      return NextResponse.json(
        { error: 'Amount parameter is required' },
        { status: 400 }
      );
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      );
    }

    const options = getStandardFinancingOptions(amountNum, state || undefined);

    return NextResponse.json({
      success: true,
      amount: amountNum,
      options,
    });
  } catch (error: any) {
    console.error('Error getting financing options:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get financing options' },
      { status: 500 }
    );
  }
}





















