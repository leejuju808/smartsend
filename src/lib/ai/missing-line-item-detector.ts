// Block 256600 — SmartSend Insurance Supplement Engine v1
// AI Missing Line Item Detector
// Detects missing line items by comparing scope to job requirements

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface MissingLineItem {
  code?: string;
  description: string;
  category: 'code_required' | 'missing_standard' | 'pricing_correction' | 'waste_factor' | 'steep_charge' | 'high_wind_zone' | 'manufacturer_requirement' | 'property_protection' | 'other';
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  reason: string;
  reasonType: string;
  codeReference?: string;
  confidence: number; // 0-100
}

export interface MissingItemsDetectionResult {
  missingItems: MissingLineItem[];
  totalMissedValue: number;
  highPriorityItems: MissingLineItem[];
  codeRequiredItems: MissingLineItem[];
  standardMissingItems: MissingLineItem[];
  summary: string;
}

/**
 * Detect missing line items from insurance scope
 */
export async function detectMissingLineItems(
  parsedScope: {
    lineItems: Array<{
      code?: string;
      description: string;
      quantity: number;
      unit: string;
    }>;
    roofSquares?: number;
    roofPitch?: number;
    roofType?: string;
    region?: string;
  },
  jobData?: {
    photos?: string[];
    measurements?: Record<string, any>;
    pitch?: number;
    squares?: number;
    roofType?: string;
  }
): Promise<MissingItemsDetectionResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are SmartSend AI Missing Line Item Detector v1 - an expert at identifying missing items in insurance scopes.

Your job: Compare the insurance adjuster's scope to what SHOULD be included for a complete roofing job.

COMMON MISSING ITEMS (check for ALL of these):

1. CODE-REQUIRED ITEMS (always check):
   - Drip Edge (required by code in most regions)
   - Ice & Water Shield (required in cold climates, valleys, eaves)
   - Starter Strip (required at eaves)
   - Ridge Vent System (if ventilation needed)
   - Deck Re-Nailing (if decking is replaced)
   - Synthetic Felt Underlayment (upgrade from felt paper)
   - Valley Metal (if valleys exist)
   - Pipe Boots (for plumbing vents)
   - Siding Detach & Reset (if siding needs to be moved)

2. STANDARD MISSING ITEMS:
   - Step Flashing (around chimneys, walls)
   - Counterflashing (if step flashing used)
   - Satellite Dish Removal (if present)
   - Extra Plywood (if decking is damaged)
   - Tear-Off Extra Layers (if multiple layers exist)
   - Property Protection (tarps, protection materials)
   - Dumpster Fees (waste removal)
   - Cleanup & Haul-Away

3. PRICING CORRECTIONS:
   - Steep Charge (if pitch is 8/12 or higher)
   - High-Wind Zone Install (if in high-wind area)
   - Waste Factor (should be 10-15% for most jobs)
   - O&P (Overhead & Profit - should be 10-20%)

4. WASTE FACTOR:
   - Standard waste: 10% for simple roofs, 15% for complex roofs
   - Check if waste is included in quantities

5. PITCH-BASED CHARGES:
   - 8/12 to 10/12: Steep charge applies
   - 10/12 to 12/12: Very steep charge
   - 12/12+: Extreme steep charge

Return ONLY valid JSON with this structure:
{
  "missingItems": [
    {
      "code": "RFG220",
      "description": "Ice & Water Shield",
      "category": "code_required",
      "quantity": 2,
      "unit": "ROLL",
      "unitPrice": 148.10,
      "totalPrice": 296.20,
      "reason": "Required by local building code for valleys and eaves in cold climates",
      "reasonType": "code_required",
      "codeReference": "IRC R905.2.7",
      "confidence": 95
    }
  ],
  "totalMissedValue": 3742.88,
  "highPriorityItems": [...], // Items with confidence > 80
  "codeRequiredItems": [...], // Items that are code-required
  "standardMissingItems": [...], // Standard items that should be included
  "summary": "Detected 6 missing items totaling $3,742.88. Includes code-required items (ice & water shield, drip edge) and standard items (ridge vent, starter strip)."
}

Be thorough. Check EVERY common missing item. Use realistic pricing based on region and roof size.`;

  const scopeSummary = `
Insurance Scope Summary:
- Roof Squares: ${parsedScope.roofSquares || 'Unknown'}
- Roof Pitch: ${parsedScope.roofPitch || 'Unknown'} (${parsedScope.roofPitch ? `${parsedScope.roofPitch}/12` : 'Unknown'})
- Roof Type: ${parsedScope.roofType || 'Unknown'}
- Region: ${parsedScope.region || 'Unknown'}

Line Items in Scope (${parsedScope.lineItems.length} items):
${parsedScope.lineItems.map((item, i) => 
  `${i + 1}. ${item.code || 'N/A'} - ${item.description} (${item.quantity} ${item.unit})`
).join('\n')}
`;

  const jobContext = jobData ? `
Job Context:
- Photos: ${jobData.photos?.length || 0} photos available
- Measured Squares: ${jobData.squares || 'Unknown'}
- Measured Pitch: ${jobData.pitch || 'Unknown'}
- Roof Type: ${jobData.roofType || 'Unknown'}
` : '';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `${scopeSummary}\n\n${jobContext}\n\nAnalyze this scope and detect ALL missing items. Return ONLY valid JSON.`,
        },
      ],
      max_tokens: 3000,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const result = JSON.parse(content) as MissingItemsDetectionResult;

    // Validate and categorize
    if (!result.missingItems) {
      result.missingItems = [];
    }
    if (result.totalMissedValue === undefined) {
      result.totalMissedValue = result.missingItems.reduce(
        (sum, item) => sum + (item.totalPrice || 0),
        0
      );
    }
    if (!result.highPriorityItems) {
      result.highPriorityItems = result.missingItems.filter(
        (item) => item.confidence >= 80
      );
    }
    if (!result.codeRequiredItems) {
      result.codeRequiredItems = result.missingItems.filter(
        (item) => item.category === 'code_required'
      );
    }
    if (!result.standardMissingItems) {
      result.standardMissingItems = result.missingItems.filter(
        (item) => item.category === 'missing_standard'
      );
    }
    if (!result.summary) {
      result.summary = `Detected ${result.missingItems.length} missing items totaling $${result.totalMissedValue.toFixed(2)}.`;
    }

    return result;
  } catch (error: any) {
    console.error('Error detecting missing line items:', error);
    throw new Error(`Failed to detect missing items: ${error.message}`);
  }
}





















