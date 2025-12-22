// Block 18300 — Material Detection Engine v1
// POST /api/materials/detect
// Detects roofing materials from homeowner messages/text

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

// Material detection patterns from language
const MATERIAL_PATTERNS = {
  asphalt_shingle: [
    'composition roof', 'composition shingle', 'asphalt shingle', 'asphalt roof',
    'shingle roof', 'shingles', '3-tab', 'three tab', 'architectural shingle',
    'dimensional shingle', 'premium shingle', 'impact resistant shingle'
  ],
  metal: [
    'metal roof', 'metal roofing', 'standing seam', 'corrugated metal',
    'ribbed panel', 'metal panel', 'tin roof', 'steel roof'
  ],
  tile: [
    'tile roof', 'tile roofing', 'clay tile', 'clay shingle', 'concrete tile',
    'spanish tile', 'slate tile', 'ceramic tile'
  ],
  flat_tpo: [
    'tpo roof', 'tpo membrane', 'flat roof', 'flat roofing', 'tpo'
  ],
  flat_epdm: [
    'epdm roof', 'epdm membrane', 'rubber roof', 'rubber membrane', 'epdm'
  ],
  flat_mod_bit: [
    'modified bitumen', 'mod bit', 'torch down', 'rolled roofing', 'bitumen'
  ],
  slate: [
    'slate roof', 'slate shingle', 'slate tile'
  ],
  wood_shake: [
    'wood shake', 'cedar shake', 'wood shingle', 'cedar shingle'
  ]
};

const SHINGLE_TYPE_PATTERNS = {
  '3_tab': ['3-tab', 'three tab', '3 tab'],
  'architectural': ['architectural', 'dimensional', 'laminate'],
  'premium': ['premium', 'luxury', 'designer'],
  'impact_resistant': ['impact resistant', 'impact-resistant', 'class 4', 'hail resistant']
};

const COMPONENT_PATTERNS = {
  skylight: ['skylight', 'sky light', 'roof window'],
  chimney: ['chimney', 'fireplace'],
  vent: ['vent', 'roof vent', 'attic vent', 'box vent', 'ridge vent'],
  pipe: ['pipe', 'plumbing vent', 'vent pipe'],
  satellite: ['satellite', 'dish', 'satellite dish']
};

const PITCH_PATTERNS = {
  low_slope: ['flat', 'low slope', 'low pitch', 'almost flat'],
  medium_slope: ['medium slope', 'moderate pitch', 'normal pitch'],
  steep_slope: ['steep', 'high pitch', 'steep slope', 'very steep']
};

const AGE_INDICATORS = {
  '0_5_years': ['new', 'recent', 'just installed', 'newly installed', 'brand new'],
  '6_15_years': ['few years', 'several years', 'about 10 years', 'decade'],
  '16_25_years': ['15 years', '20 years', 'couple decades', 'older'],
  '25_plus_years': ['old', 'very old', 'ancient', 'original', '30 years', '40 years', '50 years']
};

const CONDITION_INDICATORS = {
  granule_loss: ['granule', 'granules', 'losing granules', 'bare spots'],
  shingle_curl: ['curling', 'curled', 'warped', 'buckling'],
  moss_buildup: ['moss', 'algae', 'green', 'growth'],
  hail_impact: ['hail', 'hail damage', 'hail marks', 'dents'],
  wind_uplift: ['wind', 'wind damage', 'lifted', 'missing shingles', 'blown off']
};

interface DetectionResult {
  materialType: string | null;
  shingleType: string | null;
  metalType: string | null;
  tileType: string | null;
  flatType: string | null;
  pitchEstimate: string | null;
  layerCount: string | null;
  roofAgeCategory: string | null;
  components: {
    skylights: boolean;
    chimney: boolean;
    boxVents: boolean;
    ridgeVents: boolean;
    pipeBoots: boolean;
    satelliteMounts: boolean;
  };
  conditions: {
    granuleLoss: boolean;
    shingleCurl: boolean;
    mossBuildup: boolean;
    hailImpact: boolean;
    windUplift: boolean;
  };
  confidence: number;
  clues: string[];
  metadata: Record<string, any>;
}

function detectFromText(text: string): DetectionResult {
  const lowerText = text.toLowerCase();
  const result: DetectionResult = {
    materialType: null,
    shingleType: null,
    metalType: null,
    tileType: null,
    flatType: null,
    pitchEstimate: null,
    layerCount: null,
    roofAgeCategory: null,
    components: {
      skylights: false,
      chimney: false,
      boxVents: false,
      ridgeVents: false,
      pipeBoots: false,
      satelliteMounts: false,
    },
    conditions: {
      granuleLoss: false,
      shingleCurl: false,
      mossBuildup: false,
      hailImpact: false,
      windUplift: false,
    },
    confidence: 0,
    clues: [],
    metadata: {},
  };

  // Detect material type
  for (const [material, patterns] of Object.entries(MATERIAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        result.materialType = material;
        result.clues.push(`Found "${pattern}" in text`);
        break;
      }
    }
    if (result.materialType) break;
  }

  // Detect shingle type (if asphalt)
  if (result.materialType === 'asphalt_shingle') {
    for (const [shingleType, patterns] of Object.entries(SHINGLE_TYPE_PATTERNS)) {
      for (const pattern of patterns) {
        if (lowerText.includes(pattern)) {
          result.shingleType = shingleType;
          result.clues.push(`Found shingle type "${pattern}"`);
          break;
        }
      }
      if (result.shingleType) break;
    }
  }

  // Detect metal type
  if (result.materialType === 'metal') {
    if (lowerText.includes('standing seam')) {
      result.metalType = 'standing_seam';
      result.clues.push('Detected standing seam metal');
    } else if (lowerText.includes('corrugated')) {
      result.metalType = 'corrugated';
      result.clues.push('Detected corrugated metal');
    } else if (lowerText.includes('ribbed')) {
      result.metalType = 'ribbed_panel';
      result.clues.push('Detected ribbed panel');
    }
  }

  // Detect tile type
  if (result.materialType === 'tile') {
    if (lowerText.includes('clay')) {
      result.tileType = 'clay';
      result.clues.push('Detected clay tile');
    } else if (lowerText.includes('concrete')) {
      result.tileType = 'concrete';
      result.clues.push('Detected concrete tile');
    } else if (lowerText.includes('slate')) {
      result.tileType = 'slate_look';
      result.clues.push('Detected slate-look tile');
    }
  }

  // Detect flat roof type
  if (result.materialType?.startsWith('flat_')) {
    if (lowerText.includes('tpo')) {
      result.flatType = 'tpo';
    } else if (lowerText.includes('epdm') || lowerText.includes('rubber')) {
      result.flatType = 'epdm';
    } else if (lowerText.includes('modified bitumen') || lowerText.includes('torch down')) {
      result.flatType = 'modified_bitumen';
    }
  }

  // Detect pitch
  for (const [pitch, patterns] of Object.entries(PITCH_PATTERNS)) {
    for (const pattern of patterns) {
      if (lowerText.includes(pattern)) {
        result.pitchEstimate = pitch;
        result.clues.push(`Detected pitch: ${pattern}`);
        break;
      }
    }
    if (result.pitchEstimate) break;
  }

  // Detect layer count
  if (lowerText.includes('two layers') || lowerText.includes('2 layers') || lowerText.includes('double layer')) {
    result.layerCount = '2_layers';
    result.clues.push('Detected 2 layers');
  } else if (lowerText.includes('one layer') || lowerText.includes('1 layer') || lowerText.includes('single layer')) {
    result.layerCount = '1_layer';
    result.clues.push('Detected 1 layer');
  }

  // Detect age
  for (const [ageCategory, indicators] of Object.entries(AGE_INDICATORS)) {
    for (const indicator of indicators) {
      if (lowerText.includes(indicator)) {
        result.roofAgeCategory = ageCategory;
        result.clues.push(`Detected age indicator: ${indicator}`);
        break;
      }
    }
    if (result.roofAgeCategory) break;
  }

  // Detect components
  if (lowerText.includes('skylight') || lowerText.includes('sky light')) {
    result.components.skylights = true;
    result.clues.push('Detected skylight');
  }
  if (lowerText.includes('chimney')) {
    result.components.chimney = true;
    result.clues.push('Detected chimney');
  }
  if (lowerText.includes('box vent')) {
    result.components.boxVents = true;
    result.clues.push('Detected box vent');
  }
  if (lowerText.includes('ridge vent')) {
    result.components.ridgeVents = true;
    result.clues.push('Detected ridge vent');
  }
  if (lowerText.includes('pipe') || lowerText.includes('plumbing vent')) {
    result.components.pipeBoots = true;
    result.clues.push('Detected pipe/vent');
  }
  if (lowerText.includes('satellite') || lowerText.includes('dish')) {
    result.components.satelliteMounts = true;
    result.clues.push('Detected satellite mount');
  }

  // Detect conditions
  for (const [condition, indicators] of Object.entries(CONDITION_INDICATORS)) {
    for (const indicator of indicators) {
      if (lowerText.includes(indicator)) {
        (result.conditions as any)[condition] = true;
        result.clues.push(`Detected condition: ${indicator}`);
        break;
      }
    }
  }

  // Calculate confidence based on clues found
  const clueCount = result.clues.length;
  if (result.materialType) {
    result.confidence = Math.min(95, 60 + (clueCount * 5));
  } else {
    result.confidence = Math.min(50, clueCount * 10);
  }

  result.metadata = {
    textLength: text.length,
    clueCount,
    detectionMethod: 'pattern_matching',
  };

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contactId, text } = body;

    if (!contactId || !text) {
      return NextResponse.json(
        { error: "contactId and text are required" },
        { status: 400 }
      );
    }

    // Get contact and workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Detect materials from text
    const detection = detectFromText(text);

    // Upsert material intelligence
    const { data: intelligence, error: intelError } = await supabase
      .from("material_intelligence")
      .upsert({
        contact_id: contactId,
        workspace_id: contact.workspace_id,
        material_type: detection.materialType,
        shingle_type: detection.shingleType,
        metal_type: detection.metalType,
        tile_type: detection.tileType,
        flat_type: detection.flatType,
        pitch_estimate: detection.pitchEstimate,
        layer_count: detection.layerCount,
        roof_age_category: detection.roofAgeCategory,
        has_skylights: detection.components.skylights,
        has_chimney: detection.components.chimney,
        has_box_vents: detection.components.boxVents,
        has_ridge_vents: detection.components.ridgeVents,
        has_pipe_boots: detection.components.pipeBoots,
        has_satellite_mounts: detection.components.satelliteMounts,
        granule_loss_detected: detection.conditions.granuleLoss,
        shingle_curl_detected: detection.conditions.shingleCurl,
        moss_buildup_detected: detection.conditions.mossBuildup,
        hail_impact_marks: detection.conditions.hailImpact,
        wind_uplift_detected: detection.conditions.windUplift,
        detected_from_text: true,
        text_confidence: detection.confidence,
        detection_metadata: {
          ...detection.metadata,
          clues: detection.clues,
        },
        last_analyzed_at: new Date().toISOString(),
      }, {
        onConflict: 'contact_id',
      })
      .select()
      .single();

    if (intelError) {
      console.error("Error saving material intelligence:", intelError);
      return NextResponse.json(
        { error: "Failed to save detection" },
        { status: 500 }
      );
    }

    // Calculate scores
    await supabase.rpc('calculate_material_scores', {
      p_contact_id: contactId,
    });

    return NextResponse.json({
      success: true,
      detection,
      intelligence,
    });
  } catch (error: any) {
    console.error("Error detecting materials:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































