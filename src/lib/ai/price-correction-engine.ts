// Block 256600 — SmartSend Insurance Supplement Engine v1
// AI Price Correction Engine (Xactimate Sync)
// Compares carrier prices to Xactimate regional pricing

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface PriceCorrection {
  code: string;
  description: string;
  carrierPaidPrice: number;
  xactimatePrice: number;
  priceDifference: number;
  quantity: number;
  totalAdjustment: number;
  region: string;
  confidence: number; // 0-100
}

export interface PriceCorrectionResult {
  corrections: PriceCorrection[];
  totalAdjustment: number;
  itemsUnderpaid: number;
  summary: string;
}

/**
 * Xactimate pricing lookup (simulated - in production, use actual Xactimate API)
 * This uses AI to estimate Xactimate pricing based on region and item
 */
async function lookupXactimatePrice(
  code: string,
  description: string,
  region: string,
  unit: string
): Promise<number> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // In production, this would call Xactimate API
  // For now, use AI to estimate based on known pricing patterns
  const systemPrompt = `You are a Xactimate pricing expert. Estimate the current Xactimate price for roofing line items.

Given:
- Code: ${code}
- Description: ${description}
- Region: ${region}
- Unit: ${unit}

Return ONLY a JSON object with the estimated Xactimate price:
{
  "price": 74.92
}

Use realistic pricing based on:
- Regional pricing variations (TX is typically lower than CA)
- Item type (removal vs installation vs materials)
- Current market rates (2024-2025)

Common pricing ranges:
- Remove shingles: $45-85 per SQ
- Install shingles: $60-120 per SQ
- Drip edge: $2.50-4.50 per LF
- Ice & water shield: $120-180 per roll
- Starter strip: $30-50 per bundle
- Ridge vent: $5-8 per LF
- Steep charge: 15-25% of base price (for 8/12+ pitch)`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Estimate Xactimate price for: ${code} - ${description} in ${region} (${unit})`,
        },
      ],
      max_tokens: 200,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const result = JSON.parse(content);
    return result.price || 0;
  } catch (error) {
    console.error('Error looking up Xactimate price:', error);
    return 0;
  }
}

/**
 * Detect price corrections by comparing carrier prices to Xactimate
 */
export async function detectPriceCorrections(
  lineItems: Array<{
    code?: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }>,
  region: string
): Promise<PriceCorrectionResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const corrections: PriceCorrection[] = [];

  // Check each line item for pricing discrepancies
  for (const item of lineItems) {
    if (!item.code && !item.description) continue;

    try {
      const xactimatePrice = await lookupXactimatePrice(
        item.code || '',
        item.description,
        region,
        item.unit
      );

      if (xactimatePrice > 0 && item.unitPrice < xactimatePrice * 0.9) {
        // Price is more than 10% below Xactimate
        const difference = xactimatePrice - item.unitPrice;
        const totalAdjustment = difference * item.quantity;

        corrections.push({
          code: item.code || 'N/A',
          description: item.description,
          carrierPaidPrice: item.unitPrice,
          xactimatePrice,
          priceDifference: difference,
          quantity: item.quantity,
          totalAdjustment,
          region,
          confidence: 85, // High confidence if Xactimate price is significantly higher
        });
      }
    } catch (error) {
      console.error(`Error checking price for ${item.description}:`, error);
      // Continue with other items
    }
  }

  const totalAdjustment = corrections.reduce(
    (sum, corr) => sum + corr.totalAdjustment,
    0
  );

  const summary = corrections.length > 0
    ? `Found ${corrections.length} items underpaid by carrier. Total adjustment: $${totalAdjustment.toFixed(2)}.`
    : 'No significant price discrepancies detected.';

  return {
    corrections,
    totalAdjustment,
    itemsUnderpaid: corrections.length,
    summary,
  };
}

/**
 * Calculate supplement opportunity score based on missing items and price corrections
 */
export function calculateSupplementOpportunityScore(
  missingItemsValue: number,
  priceCorrectionsValue: number,
  totalScopeValue: number
): number {
  // Score = (missing value / scope value * 50) + (corrections / scope value * 30) + (item count bonus)
  // Capped at 100

  const missingPercentage = totalScopeValue > 0
    ? (missingItemsValue / totalScopeValue) * 50
    : 0;

  const correctionsPercentage = totalScopeValue > 0
    ? (priceCorrectionsValue / totalScopeValue) * 30
    : 0;

  // Bonus for high-value items (10 points max)
  const valueBonus = Math.min(10, (missingItemsValue + priceCorrectionsValue) / 500);

  const score = Math.min(100, missingPercentage + correctionsPercentage + valueBonus);

  return Math.round(score);
}





















