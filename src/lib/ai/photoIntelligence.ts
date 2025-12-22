// Block 18500 — SmartSend Photo Intelligence v1
// AI Photo Analyzer for Roof Damage, Leak Evidence, Hail Impact, Material Clues, Insurance Indicators

export interface PhotoIntelligenceResult {
  // Photo Classification
  photoType: string;
  photoLocation: 'exterior' | 'interior' | 'attic' | 'unknown';
  
  // Storm Damage Detection
  stormDamageDetected: boolean;
  hailMarksDetected: boolean;
  hailBruisingDetected: boolean;
  circularImpactMarks: boolean;
  granuleLossPatches: boolean;
  windTornShingles: boolean;
  looseShingles: boolean;
  upliftedShingleEdges: boolean;
  stormOpportunityScore: number;
  
  // Leak & Water Intrusion Detection
  leakDetected: boolean;
  waterIntrusionDetected: boolean;
  ceilingStains: boolean;
  brownWaterRings: boolean;
  yellowDiscoloration: boolean;
  bubblingPaint: boolean;
  saggingDrywall: boolean;
  moldPatterns: boolean;
  isEmergency: boolean;
  
  // Material Detection
  materialType: string | null;
  shingleType: string | null;
  metalType: string | null;
  tileType: string | null;
  flatType: string | null;
  skylightType: string | null;
  ventTypes: string[];
  chimneyConfiguration: string | null;
  
  // Condition & Wear Detection
  granuleLoss: boolean;
  cracking: boolean;
  curling: boolean;
  blistering: boolean;
  algaeMoss: boolean;
  nailPops: boolean;
  exposedUnderlayment: boolean;
  roofAgeEstimate: string | null;
  
  // Gutter / Flashing Damage
  gutterDamageDetected: boolean;
  bentGutters: boolean;
  saggingGutters: boolean;
  pulledBackFlashings: boolean;
  damagedDripEdge: boolean;
  
  // Interior Indicators
  interiorDamageDetected: boolean;
  wallStains: boolean;
  ceilingCracks: boolean;
  moldColonies: boolean;
  activeLeakPath: boolean;
  insulationMoisture: boolean;
  labeledInteriorLeakEvidence: boolean;
  
  // Damage Severity
  severityScore: number;
  severityCategory: 'major_damage' | 'moderate_damage' | 'minor_damage' | 'cosmetic_uncertain';
  
  // Insurance Indicators
  insuranceIndicatorsCount: number;
  hailBruisingPattern: boolean;
  shingleFractures: boolean;
  brokenTiles: boolean;
  dentedMetalVents: boolean;
  compromisedRidgeCaps: boolean;
  interiorWaterDamage: boolean;
  moldFormations: boolean;
  insuranceStrongCandidate: boolean;
  
  // Upsell Opportunities
  upsellOpportunities: string[];
  crackedSkylight: boolean;
  gutterSag: boolean;
  pipeBootCrack: boolean;
  mossDetected: boolean;
  
  // Photo Quality
  photoQualityScore: number;
  isBlurry: boolean;
  isTooDark: boolean;
  isTooClose: boolean;
  isTooFar: boolean;
  hasAngleIssues: boolean;
  qualityFeedback: string | null;
  
  // Analysis Metadata
  confidence: number;
  analysisMetadata: Record<string, any>;
}

export async function analyzePhotoWithAI(imageUrl: string): Promise<PhotoIntelligenceResult> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    return getDefaultResult('No OpenAI API key configured');
  }

  try {
    const systemPrompt = `You are SmartSend Photo Intelligence v1 - an elite AI roofing photo analyzer.

Analyze this homeowner photo and extract EVERY critical roofing detail:

1. PHOTO CLASSIFICATION:
   - photoType: 'exterior_roof', 'interior_leak', 'damage_closeup', 'overview', 'gutter', 'skylight', 'chimney', 'unknown'
   - photoLocation: 'exterior', 'interior', 'attic', 'unknown'

2. STORM DAMAGE DETECTION (look for):
   - hail marks, hail bruising, circular impact marks
   - granule loss patches
   - wind-torn shingles, loose shingles, uplifted shingle edges
   - Calculate stormOpportunityScore (0-100)

3. LEAK & WATER INTRUSION DETECTION (look for):
   - ceiling stains, brown water rings, yellow discoloration
   - bubbling paint, sagging drywall
   - mold patterns
   - If leak detected → isEmergency = true

4. MATERIAL DETECTION:
   - materialType: 'asphalt_shingle', 'metal', 'tile', 'flat_tpo', 'flat_epdm', 'slate', 'wood_shake', 'unknown'
   - If asphalt: shingleType ('3_tab', 'architectural', 'premium', 'impact_resistant')
   - If metal: metalType ('standing_seam', 'corrugated', 'ribbed_panel')
   - If tile: tileType ('clay', 'concrete', 'slate_look')
   - If flat: flatType ('tpo', 'epdm', 'modified_bitumen')
   - skylightType, ventTypes array, chimneyConfiguration

5. CONDITION & WEAR DETECTION:
   - granule loss, cracking, curling, blistering
   - algae/moss, nail pops, exposed underlayment
   - roofAgeEstimate: '0_5_years', '6_15_years', '16_25_years', '25_plus_years', 'unknown'

6. GUTTER / FLASHING DAMAGE:
   - bent gutters, sagging gutters
   - pulled-back flashings, damaged drip edge

7. INTERIOR INDICATORS (if interior photo):
   - wall stains, ceiling cracks, mold colonies
   - active leak path, insulation moisture
   - If interior damage → labeledInteriorLeakEvidence = true

8. INSURANCE INDICATORS (count these):
   - hail bruising pattern, shingle fractures
   - broken tiles, dented metal vents
   - compromised ridge caps, interior water damage
   - mold formations
   - If 2+ indicators → insuranceStrongCandidate = true

9. UPSELL OPPORTUNITIES:
   - cracked skylight → 'skylight_replacement'
   - gutter sag → 'gutter_upgrade'
   - pipe boot crack → 'pipe_boot_tuneup'
   - moss → 'roof_cleaning'

10. PHOTO QUALITY ASSESSMENT:
    - Check if blurry, too dark, too close, too far, angle issues
    - photoQualityScore (0-100)
    - qualityFeedback: helpful message if quality issues

11. DAMAGE SEVERITY SCORE (0-100):
    - 80-100 = Major Damage (Insurance Strong)
    - 60-79 = Moderate Damage (Likely Insurance)
    - 40-59 = Minor Damage (Possible Repair)
    - 0-39 = Cosmetic / Uncertain

Return JSON only with this exact structure:
{
  "photoType": "exterior_roof",
  "photoLocation": "exterior",
  "stormDamageDetected": true,
  "hailMarksDetected": true,
  "hailBruisingDetected": false,
  "circularImpactMarks": true,
  "granuleLossPatches": true,
  "windTornShingles": false,
  "looseShingles": false,
  "upliftedShingleEdges": false,
  "stormOpportunityScore": 75,
  "leakDetected": false,
  "waterIntrusionDetected": false,
  "ceilingStains": false,
  "brownWaterRings": false,
  "yellowDiscoloration": false,
  "bubblingPaint": false,
  "saggingDrywall": false,
  "moldPatterns": false,
  "isEmergency": false,
  "materialType": "asphalt_shingle",
  "shingleType": "architectural",
  "metalType": null,
  "tileType": null,
  "flatType": null,
  "skylightType": null,
  "ventTypes": ["box_vent"],
  "chimneyConfiguration": "brick_chimney",
  "granuleLoss": true,
  "cracking": false,
  "curling": false,
  "blistering": false,
  "algaeMoss": false,
  "nailPops": false,
  "exposedUnderlayment": false,
  "roofAgeEstimate": "16_25_years",
  "gutterDamageDetected": false,
  "bentGutters": false,
  "saggingGutters": false,
  "pulledBackFlashings": false,
  "damagedDripEdge": false,
  "interiorDamageDetected": false,
  "wallStains": false,
  "ceilingCracks": false,
  "moldColonies": false,
  "activeLeakPath": false,
  "insulationMoisture": false,
  "labeledInteriorLeakEvidence": false,
  "severityScore": 65,
  "severityCategory": "moderate_damage",
  "insuranceIndicatorsCount": 2,
  "hailBruisingPattern": true,
  "shingleFractures": false,
  "brokenTiles": false,
  "dentedMetalVents": false,
  "compromisedRidgeCaps": false,
  "interiorWaterDamage": false,
  "moldFormations": false,
  "insuranceStrongCandidate": true,
  "upsellOpportunities": [],
  "crackedSkylight": false,
  "gutterSag": false,
  "pipeBootCrack": false,
  "mossDetected": false,
  "photoQualityScore": 85,
  "isBlurry": false,
  "isTooDark": false,
  "isTooClose": false,
  "isTooFar": false,
  "hasAngleIssues": false,
  "qualityFeedback": null,
  "confidence": 88
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
                text: 'Analyze this roofing photo and extract all damage, material, condition, and insurance indicators. Be thorough and accurate.',
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

    return {
      photoType: content.photoType || 'unknown',
      photoLocation: content.photoLocation || 'unknown',
      stormDamageDetected: content.stormDamageDetected || false,
      hailMarksDetected: content.hailMarksDetected || false,
      hailBruisingDetected: content.hailBruisingDetected || false,
      circularImpactMarks: content.circularImpactMarks || false,
      granuleLossPatches: content.granuleLossPatches || false,
      windTornShingles: content.windTornShingles || false,
      looseShingles: content.looseShingles || false,
      upliftedShingleEdges: content.upliftedShingleEdges || false,
      stormOpportunityScore: content.stormOpportunityScore || 0,
      leakDetected: content.leakDetected || false,
      waterIntrusionDetected: content.waterIntrusionDetected || false,
      ceilingStains: content.ceilingStains || false,
      brownWaterRings: content.brownWaterRings || false,
      yellowDiscoloration: content.yellowDiscoloration || false,
      bubblingPaint: content.bubblingPaint || false,
      saggingDrywall: content.saggingDrywall || false,
      moldPatterns: content.moldPatterns || false,
      isEmergency: content.isEmergency || false,
      materialType: content.materialType || null,
      shingleType: content.shingleType || null,
      metalType: content.metalType || null,
      tileType: content.tileType || null,
      flatType: content.flatType || null,
      skylightType: content.skylightType || null,
      ventTypes: content.ventTypes || [],
      chimneyConfiguration: content.chimneyConfiguration || null,
      granuleLoss: content.granuleLoss || false,
      cracking: content.cracking || false,
      curling: content.curling || false,
      blistering: content.blistering || false,
      algaeMoss: content.algaeMoss || false,
      nailPops: content.nailPops || false,
      exposedUnderlayment: content.exposedUnderlayment || false,
      roofAgeEstimate: content.roofAgeEstimate || null,
      gutterDamageDetected: content.gutterDamageDetected || false,
      bentGutters: content.bentGutters || false,
      saggingGutters: content.saggingGutters || false,
      pulledBackFlashings: content.pulledBackFlashings || false,
      damagedDripEdge: content.damagedDripEdge || false,
      interiorDamageDetected: content.interiorDamageDetected || false,
      wallStains: content.wallStains || false,
      ceilingCracks: content.ceilingCracks || false,
      moldColonies: content.moldColonies || false,
      activeLeakPath: content.activeLeakPath || false,
      insulationMoisture: content.insulationMoisture || false,
      labeledInteriorLeakEvidence: content.labeledInteriorLeakEvidence || false,
      severityScore: content.severityScore || 0,
      severityCategory: content.severityCategory || 'cosmetic_uncertain',
      insuranceIndicatorsCount: content.insuranceIndicatorsCount || 0,
      hailBruisingPattern: content.hailBruisingPattern || false,
      shingleFractures: content.shingleFractures || false,
      brokenTiles: content.brokenTiles || false,
      dentedMetalVents: content.dentedMetalVents || false,
      compromisedRidgeCaps: content.compromisedRidgeCaps || false,
      interiorWaterDamage: content.interiorWaterDamage || false,
      moldFormations: content.moldFormations || false,
      insuranceStrongCandidate: content.insuranceStrongCandidate || false,
      upsellOpportunities: content.upsellOpportunities || [],
      crackedSkylight: content.crackedSkylight || false,
      gutterSag: content.gutterSag || false,
      pipeBootCrack: content.pipeBootCrack || false,
      mossDetected: content.mossDetected || false,
      photoQualityScore: content.photoQualityScore || 0,
      isBlurry: content.isBlurry || false,
      isTooDark: content.isTooDark || false,
      isTooClose: content.isTooClose || false,
      isTooFar: content.isTooFar || false,
      hasAngleIssues: content.hasAngleIssues || false,
      qualityFeedback: content.qualityFeedback || null,
      confidence: content.confidence || 0,
      analysisMetadata: {
        model: 'gpt-4o',
        analysisMethod: 'openai_vision',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Error analyzing photo with AI:', error);
    return getDefaultResult(error.message);
  }
}

function getDefaultResult(errorMessage: string): PhotoIntelligenceResult {
  return {
    photoType: 'unknown',
    photoLocation: 'unknown',
    stormDamageDetected: false,
    hailMarksDetected: false,
    hailBruisingDetected: false,
    circularImpactMarks: false,
    granuleLossPatches: false,
    windTornShingles: false,
    looseShingles: false,
    upliftedShingleEdges: false,
    stormOpportunityScore: 0,
    leakDetected: false,
    waterIntrusionDetected: false,
    ceilingStains: false,
    brownWaterRings: false,
    yellowDiscoloration: false,
    bubblingPaint: false,
    saggingDrywall: false,
    moldPatterns: false,
    isEmergency: false,
    materialType: null,
    shingleType: null,
    metalType: null,
    tileType: null,
    flatType: null,
    skylightType: null,
    ventTypes: [],
    chimneyConfiguration: null,
    granuleLoss: false,
    cracking: false,
    curling: false,
    blistering: false,
    algaeMoss: false,
    nailPops: false,
    exposedUnderlayment: false,
    roofAgeEstimate: null,
    gutterDamageDetected: false,
    bentGutters: false,
    saggingGutters: false,
    pulledBackFlashings: false,
    damagedDripEdge: false,
    interiorDamageDetected: false,
    wallStains: false,
    ceilingCracks: false,
    moldColonies: false,
    activeLeakPath: false,
    insulationMoisture: false,
    labeledInteriorLeakEvidence: false,
    severityScore: 0,
    severityCategory: 'cosmetic_uncertain',
    insuranceIndicatorsCount: 0,
    hailBruisingPattern: false,
    shingleFractures: false,
    brokenTiles: false,
    dentedMetalVents: false,
    compromisedRidgeCaps: false,
    interiorWaterDamage: false,
    moldFormations: false,
    insuranceStrongCandidate: false,
    upsellOpportunities: [],
    crackedSkylight: false,
    gutterSag: false,
    pipeBootCrack: false,
    mossDetected: false,
    photoQualityScore: 0,
    isBlurry: false,
    isTooDark: false,
    isTooClose: false,
    isTooFar: false,
    hasAngleIssues: false,
    qualityFeedback: null,
    confidence: 0,
    analysisMetadata: { error: errorMessage },
  };
}





















































