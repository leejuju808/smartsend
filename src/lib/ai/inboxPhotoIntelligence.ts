// Block 19940 — SmartSend Inbox Photo Intelligence v1
// Enhanced AI Photo Analyzer specifically for Inbox Thread Photo Analysis
// Outputs: damage_type, severity, material, slope, condition notes, insurance likelihood, next step, job type, value range

export interface InboxPhotoAnalysisResult {
  // Damage Type Detection (AI Vision Model)
  damageType: string | null; // Primary damage category
  damageTypes: string[]; // All detected damage types
  
  // Severity Scoring (0-100)
  severity: number; // 0-100
  severityLabel: 'Minor' | 'Moderate' | 'Severe';
  severityDescription: string; // Human-readable description
  
  // Material Recognition
  materialDetected: string | null;
  materialConfidence: number; // 0-100
  
  // Roof Condition Assessment
  slopeEstimation: string | null; // 'low_slope', 'moderate_slope', 'steep_slope', 'unknown'
  roofConditionNotes: string | null;
  conditionSummary: string[]; // Array of condition observations
  
  // Insurance Likelihood Prediction
  insuranceLikelihood: number; // 0-100 percentage
  insuranceIndicators: string[]; // Array of indicators found
  
  // AI Suggested Next Step
  recommendedNextStep: string | null;
  recommendedActionType: string | null; // 'emergency_repair', 'full_inspection', 'replacement_estimate', 'quick_repair', 'monitor'
  
  // Potential Job Type
  potentialJobType: string | null; // 'repair', 'partial_replacement', 'full_replacement', 'maintenance', 'inspection_only'
  jobTypeConfidence: number; // 0-100
  
  // Value Range Based on Damage
  valueRangeMin: number | null;
  valueRangeMax: number | null;
  valueRangeType: 'repair' | 'replacement' | null;
  valueRangeFormatted: string | null; // Human-readable like "$150–$400"
  
  // Analysis Metadata
  analysisModel: string;
  analysisVersion: string;
  analysisMetadata: Record<string, any>;
}

export async function analyzeInboxPhotoWithAI(imageUrl: string): Promise<InboxPhotoAnalysisResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    return getDefaultInboxResult('No OpenAI API key configured');
  }

  try {
    const systemPrompt = `You are SmartSend Inbox Photo Intelligence v1 - an elite AI roofing photo analyzer for contractor inbox systems.

Analyze this homeowner photo and extract ALL critical roofing insights:

1. DAMAGE TYPE DETECTION - Classify the PRIMARY damage type from these categories:
   - missing_shingles
   - torn_shingles
   - lifted_shingles
   - hail_bruising
   - granule_loss
   - nail_pops
   - vent_pipe_boot_deterioration
   - flashing_separation
   - chimney_leak
   - skylight_leak
   - gutter_overflow
   - fascia_rot
   - soffit_rot
   - punctures
   - old_worn_shingles
   - moss_algae
   - debris_buildup
   - none (if no damage visible)

   Also provide ALL detected damage types in an array.

2. SEVERITY SCORING (0-100):
   - 0-20 = Minor (cosmetic issues, aging shingles, no immediate threat)
   - 20-50 = Moderate (hail impact marks with minor granule loss, some wear)
   - 50-100 = Severe (active leak, missing shingles exposing decking, major structural issues)
   
   Provide a human-readable severity description like:
   - "Active leak — missing shingles exposing decking." (Severe, 80)
   - "Hail impact marks with minor granule loss." (Moderate, 45)
   - "Aging shingles, no immediate threat." (Minor, 10)

3. MATERIAL RECOGNITION - Identify roofing material:
   - asphalt (generic)
   - architectural_shingles
   - 3_tab_shingles
   - metal_panel_roofing
   - tpo_flat_roof
   - epdm
   - tile
   - wood_shake
   - unknown

4. SLOPE ESTIMATION:
   - low_slope (appears flat or very low pitch)
   - moderate_slope (typical residential pitch)
   - steep_slope (high pitch, difficult to walk)
   - unknown

5. ROOF CONDITION ASSESSMENT - Generate condition notes:
   Examples:
   - "Shingles appear brittle"
   - "Granule loss heavy"
   - "Flashing likely failing"
   - "Decking possibly exposed"
   - "Signs of aging roof"
   - "Moss buildup detected"
   
   Provide an array of condition observations.

6. INSURANCE LIKELIHOOD PREDICTION (0-100%):
   Analyze for:
   - hail bruises
   - wind damage patterns
   - lifted shingles
   - impact marks
   - age of shingles
   
   Estimate probability that damage qualifies for insurance coverage.
   Provide array of insurance indicators found.

7. AI SUGGESTED NEXT STEP - Based on photo analysis:
   Examples:
   - "Recommend tarp + repair ASAP." (for missing shingles)
   - "Recommend full inspection – likely insurance replacement." (for hail bruising)
   - "Roof nearing end of life — schedule replacement estimate." (for granule wear)
   - "Quick repair — send tech tomorrow." (for pipe boot)
   
   Also provide recommendedActionType: 'emergency_repair', 'full_inspection', 'replacement_estimate', 'quick_repair', 'monitor'

8. POTENTIAL JOB TYPE:
   - repair (minor fixes)
   - partial_replacement (section replacement)
   - full_replacement (entire roof)
   - maintenance (cleaning, minor work)
   - inspection_only (needs assessment first)

9. VALUE RANGE ESTIMATION - Based on damage type and severity:
   For REPAIRS (minor to moderate damage):
   - Small repairs: $150-$400
   - Medium repairs: $450-$750
   - Larger repairs: $900-$1,500
   
   For REPLACEMENTS (severe damage or full replacement):
   - Small roof: $7,000-$15,000
   - Medium roof: $12,000-$22,000
   - Large roof: $18,000-$35,000
   
   Provide valueRangeMin, valueRangeMax, valueRangeType ('repair' or 'replacement'), and formatted string like "$150–$400".

Return JSON only with this exact structure:
{
  "damageType": "missing_shingles",
  "damageTypes": ["missing_shingles", "exposed_decking"],
  "severity": 80,
  "severityLabel": "Severe",
  "severityDescription": "Active leak — missing shingles exposing decking.",
  "materialDetected": "architectural_shingles",
  "materialConfidence": 92,
  "slopeEstimation": "moderate_slope",
  "roofConditionNotes": "Missing shingles exposing decking. Active leak visible. Shingles appear brittle.",
  "conditionSummary": ["Missing shingles", "Exposed decking", "Active leak", "Brittle shingles"],
  "insuranceLikelihood": 72,
  "insuranceIndicators": ["wind_damage_pattern", "lifted_shingles", "exposed_decking"],
  "recommendedNextStep": "Recommend tarp + repair ASAP.",
  "recommendedActionType": "emergency_repair",
  "potentialJobType": "repair",
  "jobTypeConfidence": 85,
  "valueRangeMin": 450,
  "valueRangeMax": 750,
  "valueRangeType": "repair",
  "valueRangeFormatted": "$450–$750"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use vision-capable model
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this roofing photo and extract all damage types, severity, material, condition, insurance likelihood, recommended next step, job type, and value range. Be thorough and accurate.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2, // Lower temperature for more consistent analysis
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0]?.message?.content || '{}');

    // Calculate severity label from severity score
    let severityLabel: 'Minor' | 'Moderate' | 'Severe' = 'Minor';
    const severity = content.severity || 0;
    if (severity >= 50) {
      severityLabel = 'Severe';
    } else if (severity >= 20) {
      severityLabel = 'Moderate';
    }

    // Format value range if provided
    let valueRangeFormatted: string | null = null;
    if (content.valueRangeMin && content.valueRangeMax) {
      const min = typeof content.valueRangeMin === 'number' ? content.valueRangeMin : parseFloat(content.valueRangeMin);
      const max = typeof content.valueRangeMax === 'number' ? content.valueRangeMax : parseFloat(content.valueRangeMax);
      if (!isNaN(min) && !isNaN(max)) {
        valueRangeFormatted = `$${min.toLocaleString()}–$${max.toLocaleString()}`;
      }
    }

    return {
      damageType: content.damageType || null,
      damageTypes: content.damageTypes || [],
      severity: severity,
      severityLabel: severityLabel,
      severityDescription: content.severityDescription || 'No damage detected.',
      materialDetected: content.materialDetected || null,
      materialConfidence: content.materialConfidence || 0,
      slopeEstimation: content.slopeEstimation || null,
      roofConditionNotes: content.roofConditionNotes || null,
      conditionSummary: content.conditionSummary || [],
      insuranceLikelihood: content.insuranceLikelihood || 0,
      insuranceIndicators: content.insuranceIndicators || [],
      recommendedNextStep: content.recommendedNextStep || null,
      recommendedActionType: content.recommendedActionType || null,
      potentialJobType: content.potentialJobType || null,
      jobTypeConfidence: content.jobTypeConfidence || 0,
      valueRangeMin: content.valueRangeMin ? parseFloat(content.valueRangeMin) : null,
      valueRangeMax: content.valueRangeMax ? parseFloat(content.valueRangeMax) : null,
      valueRangeType: content.valueRangeType || null,
      valueRangeFormatted: valueRangeFormatted,
      analysisModel: 'gpt-4o',
      analysisVersion: 'v1',
      analysisMetadata: {
        model: 'gpt-4o',
        analysisMethod: 'openai_vision',
        timestamp: new Date().toISOString(),
        rawResponse: content,
      },
    };
  } catch (error: any) {
    console.error('Error analyzing inbox photo with AI:', error);
    return getDefaultInboxResult(error.message);
  }
}

function getDefaultInboxResult(errorMessage: string): InboxPhotoAnalysisResult {
  return {
    damageType: null,
    damageTypes: [],
    severity: 0,
    severityLabel: 'Minor',
    severityDescription: 'Unable to analyze photo.',
    materialDetected: null,
    materialConfidence: 0,
    slopeEstimation: null,
    roofConditionNotes: null,
    conditionSummary: [],
    insuranceLikelihood: 0,
    insuranceIndicators: [],
    recommendedNextStep: null,
    recommendedActionType: null,
    potentialJobType: null,
    jobTypeConfidence: 0,
    valueRangeMin: null,
    valueRangeMax: null,
    valueRangeType: null,
    valueRangeFormatted: null,
    analysisModel: 'gpt-4o',
    analysisVersion: 'v1',
    analysisMetadata: { error: errorMessage },
  };
}



















































