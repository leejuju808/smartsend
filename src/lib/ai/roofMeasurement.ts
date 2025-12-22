// Block 19950 — SmartSend Roof Measurement AI v1
// AI-powered roof measurement from photo analysis

export interface RoofMeasurementResult {
  // PART 1: Photo-Based Roof Size Estimation
  estimatedSquaresMin: number;
  estimatedSquaresMax: number;
  estimatedSquaresAvg: number;
  
  // PART 2: Pitch Estimation
  pitchEstimate: string | null; // e.g., '4/12', '6/12', '8/12', '10/12'
  pitchCategory: 'low' | 'medium' | 'high' | 'steep' | 'flat' | 'unknown';
  
  // PART 3: Material Type (for cost calculation)
  materialType: string | null; // 'asphalt', 'metal', 'tile', 'flat_roof'
  
  // PART 4: Complexity Estimation
  complexityRating: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  dormersDetected: boolean;
  chimneysDetected: boolean;
  skylightsDetected: boolean;
  multiPlaneComplexity: boolean;
  steepSlopesDetected: boolean;
  flashingHeavySections: boolean;
  penetrationsCount: number;
  
  // PART 5: Measurement Confidence Score
  confidenceScore: number; // 0-100
  imageQualityScore: number; // 0-100
  angleScore: number; // 0-100
  clarityScore: number; // 0-100
  visibilityScore: number; // 0-100
  obstructionLevel: 'none' | 'low' | 'medium' | 'high';
  qualityFeedback: string | null;
  
  // PART 6: Job Type Classification
  likelyJobType: 'replacement' | 'repair_only' | 'unknown';
  replacementReasons: string[];
  repairReasons: string[];
  
  // PART 7: Roof Age Estimation
  roofAgeMin: number | null;
  roofAgeMax: number | null;
  roofAgeMedian: number | null;
  conditionAssessment: 'new' | 'early_life' | 'mid_life' | 'past_mid_life' | 'end_of_life' | 'unknown';
  granuleWearDetected: boolean;
  colorFadingDetected: boolean;
  algaeMossDetected: boolean;
  warpingDetected: boolean;
  crackingDetected: boolean;
  curlingDetected: boolean;
  
  // Analysis Metadata
  analysisMetadata: Record<string, any>;
}

export async function analyzeRoofMeasurementWithAI(imageUrl: string): Promise<RoofMeasurementResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    return getDefaultResult('No OpenAI API key configured');
  }

  try {
    const systemPrompt = `You are SmartSend Roof Measurement AI v1 - an elite AI roofing measurement analyzer.

Analyze this homeowner roof photo and extract CRITICAL measurement and estimation data:

1. ROOF SIZE ESTIMATION (Photo-Based):
   - Look for: roof planes, ridges, hips, valleys, pitch indicators, house footprint indicators, visible edges, context objects (windows, doors, gutters)
   - Estimate roof squares (1 square = 100 sq ft)
   - Provide: estimatedSquaresMin, estimatedSquaresMax, estimatedSquaresAvg
   - Example: 18-25 squares

2. PITCH ESTIMATION:
   - Analyze angles and slopes
   - Extract approximate pitch: '4/12', '6/12', '8/12', '10/12', or 'unknown'
   - Categorize: 'low' (4/12 or less), 'medium' (6/12-8/12), 'high' (10/12), 'steep' (12/12+), 'flat' (0-2/12)

3. MATERIAL TYPE DETECTION:
   - Identify: 'asphalt', 'metal', 'tile', 'flat_roof', or 'unknown'

4. COMPLEXITY ESTIMATION:
   - Detect: dormers, chimneys, skylights, multi-plane complexity, steep slopes, flashing-heavy sections, penetrations
   - Rate complexity: 'low', 'medium', 'high', 'very_high', 'unknown'
   - Count penetrations (vents, pipes, skylights, etc.)

5. MEASUREMENT CONFIDENCE SCORE:
   - Assess: image quality, angle, clarity, visibility of entire roof, obstruction level
   - Calculate confidenceScore (0-100)
   - Provide qualityFeedback if confidence is low (e.g., "Ask homeowner for a photo from the front-left angle")

6. JOB TYPE CLASSIFICATION:
   - Analyze: shingles worn, large square footage, age indicators, visible granule loss, wind-related lift
   - OR: small localized damage, roof overall looks good
   - Determine: 'replacement' or 'repair_only'
   - List reasons for the classification

7. ROOF AGE ESTIMATION:
   - Detect: granule wear, color fading, algae/moss, warping, cracking, curling
   - Estimate age range: roofAgeMin, roofAgeMax, roofAgeMedian (in years)
   - Assess condition: 'new', 'early_life', 'mid_life', 'past_mid_life', 'end_of_life', 'unknown'

Return JSON only with this exact structure:
{
  "estimatedSquaresMin": 18,
  "estimatedSquaresMax": 25,
  "estimatedSquaresAvg": 21.5,
  "pitchEstimate": "6/12",
  "pitchCategory": "medium",
  "materialType": "asphalt",
  "complexityRating": "medium",
  "dormersDetected": false,
  "chimneysDetected": true,
  "skylightsDetected": false,
  "multiPlaneComplexity": true,
  "steepSlopesDetected": false,
  "flashingHeavySections": false,
  "penetrationsCount": 3,
  "confidenceScore": 78,
  "imageQualityScore": 85,
  "angleScore": 75,
  "clarityScore": 80,
  "visibilityScore": 70,
  "obstructionLevel": "low",
  "qualityFeedback": null,
  "likelyJobType": "replacement",
  "replacementReasons": ["shingles_worn", "large_square_footage", "age_indicators", "granule_loss"],
  "repairReasons": [],
  "roofAgeMin": 12,
  "roofAgeMax": 18,
  "roofAgeMedian": 15.0,
  "conditionAssessment": "past_mid_life",
  "granuleWearDetected": true,
  "colorFadingDetected": true,
  "algaeMossDetected": false,
  "warpingDetected": false,
  "crackingDetected": true,
  "curlingDetected": false,
  "analysisMetadata": {}
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
                text: 'Analyze this roof photo and extract all measurement data: size estimation, pitch, complexity, age, and job type classification. Be thorough and accurate.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2, // Lower temperature for more consistent measurements
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0]?.message?.content || '{}');

    return {
      estimatedSquaresMin: content.estimatedSquaresMin || null,
      estimatedSquaresMax: content.estimatedSquaresMax || null,
      estimatedSquaresAvg: content.estimatedSquaresAvg || null,
      pitchEstimate: content.pitchEstimate || null,
      pitchCategory: content.pitchCategory || 'unknown',
      materialType: content.materialType || null,
      complexityRating: content.complexityRating || 'unknown',
      dormersDetected: content.dormersDetected || false,
      chimneysDetected: content.chimneysDetected || false,
      skylightsDetected: content.skylightsDetected || false,
      multiPlaneComplexity: content.multiPlaneComplexity || false,
      steepSlopesDetected: content.steepSlopesDetected || false,
      flashingHeavySections: content.flashingHeavySections || false,
      penetrationsCount: content.penetrationsCount || 0,
      confidenceScore: content.confidenceScore || 0,
      imageQualityScore: content.imageQualityScore || 0,
      angleScore: content.angleScore || 0,
      clarityScore: content.clarityScore || 0,
      visibilityScore: content.visibilityScore || 0,
      obstructionLevel: content.obstructionLevel || 'none',
      qualityFeedback: content.qualityFeedback || null,
      likelyJobType: content.likelyJobType || 'unknown',
      replacementReasons: content.replacementReasons || [],
      repairReasons: content.repairReasons || [],
      roofAgeMin: content.roofAgeMin || null,
      roofAgeMax: content.roofAgeMax || null,
      roofAgeMedian: content.roofAgeMedian || null,
      conditionAssessment: content.conditionAssessment || 'unknown',
      granuleWearDetected: content.granuleWearDetected || false,
      colorFadingDetected: content.colorFadingDetected || false,
      algaeMossDetected: content.algaeMossDetected || false,
      warpingDetected: content.warpingDetected || false,
      crackingDetected: content.crackingDetected || false,
      curlingDetected: content.curlingDetected || false,
      analysisMetadata: {
        model: 'gpt-4o',
        analysisMethod: 'openai_vision',
        timestamp: new Date().toISOString(),
        ...content.analysisMetadata,
      },
    };
  } catch (error: any) {
    console.error('Error analyzing roof measurement with AI:', error);
    return getDefaultResult(error.message);
  }
}

function getDefaultResult(errorMessage: string): RoofMeasurementResult {
  return {
    estimatedSquaresMin: null,
    estimatedSquaresMax: null,
    estimatedSquaresAvg: null,
    pitchEstimate: null,
    pitchCategory: 'unknown',
    materialType: null,
    complexityRating: 'unknown',
    dormersDetected: false,
    chimneysDetected: false,
    skylightsDetected: false,
    multiPlaneComplexity: false,
    steepSlopesDetected: false,
    flashingHeavySections: false,
    penetrationsCount: 0,
    confidenceScore: 0,
    imageQualityScore: 0,
    angleScore: 0,
    clarityScore: 0,
    visibilityScore: 0,
    obstructionLevel: 'none',
    qualityFeedback: errorMessage || 'Unable to analyze roof measurement',
    likelyJobType: 'unknown',
    replacementReasons: [],
    repairReasons: [],
    roofAgeMin: null,
    roofAgeMax: null,
    roofAgeMedian: null,
    conditionAssessment: 'unknown',
    granuleWearDetected: false,
    colorFadingDetected: false,
    algaeMossDetected: false,
    warpingDetected: false,
    crackingDetected: false,
    curlingDetected: false,
    analysisMetadata: {
      error: errorMessage,
      timestamp: new Date().toISOString(),
    },
  };
}



















































