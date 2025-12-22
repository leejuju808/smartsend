// Block 255100 — SmartSend AI Insurance Claim Engine v1
// AI Damage Classification Engine
// Analyzes photos and automatically identifies damage types for insurance claims

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface DamageClassificationResult {
  damageType: string; // Primary: 'hail', 'wind', 'mechanical', 'age', 'water', 'other'
  damageTypes: string[]; // All detected types
  confidence: number; // 0-100
  location: string; // e.g., 'North slope – near ridge'
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  findings: string; // Human-readable findings
  recommendedAction: string; // e.g., 'Full replacement → 27 squares'
  specificDamage: {
    hailBruising?: boolean;
    liftedShingles?: boolean;
    creasedTabs?: boolean;
    missingGranules?: boolean;
    windUplift?: boolean;
    crackedShingles?: boolean;
    bentMetal?: boolean;
    gutterDents?: boolean;
    softDecking?: boolean;
    granuleLoss?: boolean;
    shingleFractures?: boolean;
    exposedUnderlayment?: boolean;
  };
  squaresAffected?: number; // Estimated squares affected
  replacementRecommended?: boolean;
}

export async function classifyDamageFromPhoto(
  imageUrl: string
): Promise<DamageClassificationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are SmartSend AI Insurance Damage Classifier v1 - an elite AI roofing damage analyzer for insurance claims.

Analyze this roofing photo and identify ALL damage types with high accuracy:

1. PRIMARY DAMAGE TYPE (choose ONE):
   - 'hail' - Hail impact damage (bruising, circular marks, granule loss)
   - 'wind' - Wind damage (lifted shingles, creased tabs, missing shingles)
   - 'mechanical' - Mechanical damage (punctures, impact from objects)
   - 'age' - Age-related wear (granule loss, cracking, curling)
   - 'water' - Water damage (leaks, rot, mold)
   - 'other' - Other damage types

2. ALL DETECTED DAMAGE TYPES (array):
   Include ALL damage types visible in the photo.

3. SPECIFIC DAMAGE INDICATORS (boolean flags):
   - hailBruising: Circular impact marks, bruising on shingles
   - liftedShingles: Shingles lifted by wind
   - creasedTabs: Creased or folded shingle tabs
   - missingGranules: Granule loss patches
   - windUplift: Wind-caused shingle displacement
   - crackedShingles: Cracked or fractured shingles
   - bentMetal: Bent metal flashing, gutters, vents
   - gutterDents: Dented gutters
   - softDecking: Soft or damaged decking (if visible)
   - granuleLoss: General granule loss
   - shingleFractures: Fractured shingle material
   - exposedUnderlayment: Underlayment visible through shingle damage

4. LOCATION ON ROOF:
   Identify location: 'North slope', 'South slope', 'East slope', 'West slope', 'Ridge', 'Valley', 'Eave', 'Hip', etc.
   Be specific: 'North slope – near ridge', 'South slope – lower third', etc.

5. SEVERITY ASSESSMENT:
   - 'critical' - Immediate replacement required, active leaks
   - 'severe' - Significant damage, replacement recommended
   - 'moderate' - Moderate damage, repair or replacement
   - 'minor' - Minor damage, possible repair

6. CONFIDENCE SCORE (0-100):
   How confident are you in your assessment? Consider photo quality, damage visibility, etc.

7. RECOMMENDED ACTION:
   Provide specific recommendation:
   - "Full replacement → 27 squares"
   - "Partial replacement → 8 squares (North slope)"
   - "Repair required → 3 squares"
   - "Monitor - minor damage"

8. SQUARES AFFECTED (if applicable):
   Estimate number of squares affected (1 square = 100 sq ft)

9. REPLACEMENT RECOMMENDED:
   Boolean: true if replacement (full or partial) is recommended, false if repair is sufficient

Return ONLY valid JSON in this exact format:
{
  "damageType": "hail",
  "damageTypes": ["hail", "wind"],
  "confidence": 92,
  "location": "North slope – near ridge",
  "severity": "severe",
  "findings": "Hail bruising detected on multiple shingles. Granule loss visible. Wind uplift on ridge caps. Estimated 27 squares affected.",
  "recommendedAction": "Full replacement → 27 squares",
  "specificDamage": {
    "hailBruising": true,
    "liftedShingles": false,
    "creasedTabs": false,
    "missingGranules": true,
    "windUplift": true,
    "crackedShingles": false,
    "bentMetal": false,
    "gutterDents": false,
    "softDecking": false,
    "granuleLoss": true,
    "shingleFractures": false,
    "exposedUnderlayment": false
  },
  "squaresAffected": 27,
  "replacementRecommended": true
}

Be thorough, accurate, and conservative. Only report damage you can clearly see.`;

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
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'Analyze this roofing photo for insurance claim damage classification. Return ONLY valid JSON.',
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const result = JSON.parse(content) as DamageClassificationResult;

    // Validate and set defaults
    if (!result.damageType) {
      result.damageType = 'other';
    }
    if (!result.damageTypes || result.damageTypes.length === 0) {
      result.damageTypes = [result.damageType];
    }
    if (result.confidence === undefined) {
      result.confidence = 50;
    }
    if (!result.severity) {
      result.severity = 'moderate';
    }
    if (!result.location) {
      result.location = 'Unknown location';
    }
    if (!result.findings) {
      result.findings = `${result.damageType} damage detected`;
    }
    if (!result.recommendedAction) {
      result.recommendedAction = 'Inspection required';
    }

    return result;
  } catch (error: any) {
    console.error('Error classifying damage:', error);
    
    // Return default result on error
    return {
      damageType: 'other',
      damageTypes: ['other'],
      confidence: 0,
      location: 'Unknown',
      severity: 'moderate',
      findings: 'Unable to analyze photo',
      recommendedAction: 'Manual inspection required',
      specificDamage: {},
    };
  }
}

export async function classifyMultiplePhotos(
  imageUrls: string[]
): Promise<DamageClassificationResult[]> {
  const results = await Promise.all(
    imageUrls.map((url) => classifyDamageFromPhoto(url))
  );
  return results;
}





















